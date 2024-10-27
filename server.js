const express = require("express");
const path = require("path");
const fs = require("fs");
const youtubedl = require("youtube-dl-exec");
const dlnacasts = require("dlnacasts2");
const mm = require("music-metadata");
const NodeID3 = require("node-id3");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const config = require("./config.json");
const winston = require("winston");
const util = require("util");
const stat = util.promisify(fs.stat);
const net = require("net"); // Add this for DMR socket connection

const logger = winston.createLogger({
  level: config.logging.level,
  transports: [
    new winston.transports.Console(),
    ...(config.logging.saveToFile
      ? [
          new winston.transports.File({
            filename: `${config.logging.logPath}/app.log`,
          }),
        ]
      : []),
  ],
});

const app = express();
const port = config.server.port;
const ip = config.server.ip;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Ensure storage directories exist
[
  config.storage.downloadPath,
  config.storage.tempPath,
  config.logging.directory, // Changed from logPath to directory
].forEach((path) => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }
});

// CORS configuration
if (config.server?.cors?.enabled) {
  app.use(
    cors({
      origin: config.server.cors.origin || "*", // Add fallback value
    })
  );
}

// Rate limiting
if (config.api?.rateLimiting?.enabled) {
  // Add optional chaining
  const limiter = rateLimit({
    windowMs: config.api.rateLimiting.windowMs || 15 * 60 * 1000, // Default: 15 minutes
    max: config.api.rateLimiting.maxRequests || 100, // Default: 100 requests
  });
  app.use(limiter);
}

// Modify the DLNA initialization and handling
let dlnaService = null;

try {
  if (process.versions.bun) {
    // If running on Bun, use dummy DLNA service
    dlnaService = {
      players: [],
      on: () => {}, // Dummy event handler
    };
    logger.warn(
      "DLNA functionality disabled: Not supported in Bun environment"
    );
  } else {
    // If running on Node.js, use actual DLNA service
    dlnaService = dlnacasts();
  }
} catch (error) {
  logger.warn("DLNA initialization failed, using dummy service");
  dlnaService = {
    players: [],
    on: () => {}, // Dummy event handler
  };
}

// Function to find DLNA device by IP
function findDeviceByIp(ip) {
  return new Promise((resolve) => {
    if (!dlnaService.players) {
      // Changed from dlnacasts to dlnaService
      logger.warn("DLNA device search failed: DLNA support not available");
      resolve(null);
      return;
    }
    const devices = dlnaService.players; // Changed from dlnacasts to dlnaService
    const device = devices.find((d) => d.host === ip);
    if (device) {
      resolve(device);
    } else {
      // Start searching for devices
      dlnaService.on("update", (player) => {
        // Changed from dlnacasts to dlnaService
        if (player.host === ip) {
          resolve(player);
        }
      });

      // Set a timeout for device discovery
      setTimeout(() => {
        const device = devices.find((d) => d.host === ip);
        resolve(device || null);
      }, 5000);
    }
  });
}

// Function to update metadata for a file
async function updateMetadata(filePath, url) {
  try {
    const metadata = await youtubedl(url, {
      dumpJson: true,
      noCheckCertificates: true,
      noWarnings: true,
    });

    const tags = {
      title: metadata.title,
      artist: metadata.artist || metadata.uploader,
      album: metadata.album,
      year: metadata.upload_date
        ? metadata.upload_date.substring(0, 4)
        : undefined,
    };

    NodeID3.write(tags, filePath);
    console.log(`Updated metadata for ${filePath}`);
  } catch (error) {
    console.error(`Error updating metadata: ${error.message}`);
  }
}

// Add endpoint to set custom download path
let customDownloadPath = config.storage.downloadPath; // Default to config path
app.post("/set-download-path", (req, res) => {
  const { path: newPath } = req.body;

  if (!newPath) {
    return res
      .status(400)
      .json({ success: false, message: "Path is required" });
  }

  try {
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }
    customDownloadPath = newPath;
    res.json({ success: true, message: "Download path updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/download", async (req, res) => {
  try {
    const { url, receiverIp, storage } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: "Missing URL parameter",
      });
    }

    // Download location based on storage choice
    const downloadPath =
      storage === "local"
        ? config.storage.downloadPath
        : "//FRITZ-NAS/FRITZ.NAS/";

    // Download the track using youtube-dl
    const output = path.join(downloadPath, "%(title)s.%(ext)s");
    await youtubedl(url, {
      extractAudio: true,
      audioFormat: "mp3",
      output: output,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
    });

    const files = fs.readdirSync(downloadPath);
    const downloadedFile = files[files.length - 1];
    const filePath = path.join(downloadPath, downloadedFile);

    // Start metadata update in background
    updateMetadata(filePath, url); // Pass the url parameter

    // If receiverIp is provided, play via DLNA
    if (receiverIp) {
      const device = await findDeviceByIp(receiverIp);
      if (!device) {
        logger.warn(
          "DLNA playback not available: Device not found or DLNA not supported"
        );
        // Continue with download but return a warning
        return res.json({
          success: true,
          message: `Successfully downloaded: ${downloadedFile} (DLNA playback not available)`,
          filePath: `/downloads/${downloadedFile}`,
          warning: "DLNA playback not available in Bun environment",
        });
      }

      const mediaUrl = `http://${req.hostname}:${port}/downloads/${downloadedFile}`;
      device.play(mediaUrl, {
        title: downloadedFile,
        type: "audio/mpeg",
      });
    }

    res.json({
      success: true,
      message: `Successfully downloaded: ${downloadedFile}`,
      filePath: `/downloads/${downloadedFile}`, // Return path for browser playback
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      success: false,
      message: "Error processing your request: " + error.message,
    });
  }
});

// Enhanced file listing endpoint with sorting and filtering
app.get("/files", async (req, res) => {
  try {
    const { sort = "name", order = "asc", filter } = req.query;

    let files = await Promise.all(
      fs
        .readdirSync(customDownloadPath)
        .filter((file) => file.endsWith(".mp3"))
        .map(async (file) => {
          const filePath = path.join(customDownloadPath, file);
          const stats = await stat(filePath);
          let metadata;
          try {
            metadata = await mm.parseFile(filePath, { duration: true });
          } catch (err) {
            logger.error(`Error parsing metadata for ${file}: ${err.message}`);
            metadata = { common: {}, format: {} };
          }

          return {
            name: file,
            path: `/downloads/${file}`,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            metadata: {
              title: metadata.common.title || file,
              artist: metadata.common.artist || "Unknown Artist",
              album: metadata.common.album || "Unknown Album",
              year: metadata.common.year,
              duration: metadata.format.duration,
              bitrate: metadata.format.bitrate,
            },
          };
        })
    );

    // Apply filter if provided
    if (filter) {
      const searchTerm = filter.toLowerCase();
      files = files.filter(
        (file) =>
          file.name.toLowerCase().includes(searchTerm) ||
          file.metadata.title?.toLowerCase().includes(searchTerm) ||
          file.metadata.artist?.toLowerCase().includes(searchTerm)
      );
    }

    // Sort files
    files.sort((a, b) => {
      let compareA =
        sort === "name"
          ? a.name
          : sort === "size"
          ? a.size
          : sort === "created"
          ? a.created
          : a.modified;

      let compareB =
        sort === "name"
          ? b.name
          : sort === "size"
          ? b.size
          : sort === "created"
          ? b.created
          : b.modified;

      return order === "asc"
        ? compareA > compareB
          ? 1
          : -1
        : compareA < compareB
        ? 1
        : -1;
    });

    res.json({ success: true, files });
  } catch (error) {
    logger.error("Error listing files:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get detailed information about a specific file
app.get("/files/:filename", async (req, res) => {
  try {
    const filePath = path.join(customDownloadPath, req.params.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    const stats = await stat(filePath);
    const metadata = await mm.parseFile(filePath);

    res.json({
      success: true,
      file: {
        name: req.params.filename,
        path: `/downloads/${req.params.filename}`,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        metadata: {
          title: metadata.common.title,
          artist: metadata.common.artist,
          album: metadata.common.album,
          year: metadata.common.year,
          duration: metadata.format.duration,
          bitrate: metadata.format.bitrate,
        },
      },
    });
  } catch (error) {
    logger.error("Error getting file details:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete a file
app.delete("/files/:filename", (req, res) => {
  try {
    const filePath = path.join(customDownloadPath, req.params.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    fs.unlinkSync(filePath);
    logger.info(`Deleted file: ${req.params.filename}`);
    res.json({
      success: true,
      message: "File deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting file:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Rename a file
app.put("/files/:filename", (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName) {
      return res.status(400).json({
        success: false,
        message: "New filename is required",
      });
    }

    const oldPath = path.join(customDownloadPath, req.params.filename);
    const newPath = path.join(customDownloadPath, newName);

    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    if (fs.existsSync(newPath)) {
      return res.status(400).json({
        success: false,
        message: "A file with that name already exists",
      });
    }

    fs.renameSync(oldPath, newPath);
    logger.info(`Renamed file: ${req.params.filename} to ${newName}`);
    res.json({
      success: true,
      message: "File renamed successfully",
    });
  } catch (error) {
    logger.error("Error renaming file:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Serve downloaded files
app.use("/downloads", express.static(config.storage.downloadPath));

// Add DMR receiver setup
let dmrSocket = null;
if (config.receiver.enabled && config.receiver.type === "dmr") {
  setupDMRReceiver();
}

function setupDMRReceiver() {
  const settings = config.receiver.settings;

  dmrSocket = new net.Socket();

  dmrSocket.connect(settings.port, settings.host, () => {
    logger.info(
      `Connected to DMR receiver at ${settings.host}:${settings.port}`
    );
  });

  let currentRecording = null;
  let recordingStream = null;
  let recordingStartTime = null;

  dmrSocket.on("data", (data) => {
    try {
      // Process incoming audio data
      const timestamp = Date.now();

      // Create new recording if none exists
      if (!currentRecording) {
        const recordingFileName = `${timestamp}.${settings.audioFormat}`;
        const recordingPath = path.join(
          settings.recordingPath,
          recordingFileName
        );

        recordingStream = fs.createWriteStream(recordingPath);
        currentRecording = {
          path: recordingPath,
          startTime: timestamp,
          metadata: {
            timestamp,
            format: settings.audioFormat,
            sampleRate: settings.sampleRate,
            channels: settings.channels,
            encoding: settings.encoding,
          },
        };
        recordingStartTime = timestamp;
      }

      // Write audio data
      recordingStream.write(data);

      // Check duration limits
      const duration = timestamp - recordingStartTime;
      if (duration >= config.receiver.filters.maxDuration) {
        finishRecording();
      }
    } catch (error) {
      logger.error("Error processing DMR data:", error);
    }
  });

  dmrSocket.on("error", (error) => {
    logger.error("DMR socket error:", error);
    setTimeout(setupDMRReceiver, 3000); // Reconnect after 3 seconds
  });

  dmrSocket.on("close", () => {
    logger.info("DMR connection closed, attempting to reconnect...");
    setTimeout(setupDMRReceiver, 3000);
  });
}

function finishRecording() {
  if (currentRecording && recordingStream) {
    const duration = Date.now() - currentRecording.startTime;

    // Only save if duration meets minimum requirement
    if (duration >= config.receiver.filters.minDuration) {
      recordingStream.end();

      // Save metadata if enabled
      if (config.receiver.settings.metadata.enabled) {
        const metadataPath = currentRecording.path + ".json";
        fs.writeFileSync(
          metadataPath,
          JSON.stringify(currentRecording.metadata)
        );
      }

      // Handle auto-conversion if enabled
      if (config.receiver.processing.autoConvert.enabled) {
        convertAudio(currentRecording.path);
      }
    } else {
      // Delete recording if too short
      recordingStream.end();
      fs.unlinkSync(currentRecording.path);
    }

    currentRecording = null;
    recordingStream = null;
    recordingStartTime = null;
  }
}

async function convertAudio(inputPath) {
  const settings = config.receiver.processing.autoConvert;
  const outputPath = inputPath.replace(
    path.extname(inputPath),
    `.${settings.format}`
  );

  try {
    // Use ffmpeg to convert the audio
    // Implementation depends on your ffmpeg setup
    logger.info(`Converting ${inputPath} to ${outputPath}`);
  } catch (error) {
    logger.error("Error converting audio:", error);
  }
}

app.listen(port, ip, () => {
  logger.info(`Server running at http://${ip}:${port}`);
});
