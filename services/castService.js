const Client = require("castv2-client").Client;
const DefaultMediaReceiver = require("castv2-client").DefaultMediaReceiver;
const mdns = require("mdns");
// const logger = require("../utils/logger");

class CastService {
  constructor() {
    this.devices = new Map();
    this.browser = null;
    this.activeConnections = new Map();
  }

  start() {
    try {
      // Create browser for Chromecast devices
      this.browser = mdns.createBrowser(mdns.tcp("googlecast"));

      this.browser.on("serviceUp", (service) => {
        const device = {
          name: service.name,
          host: service.addresses[0],
          port: service.port,
          type: service.type[0].name,
          txtRecord: service.txtRecord,
        };
        this.devices.set(device.host, device);
        // logger.info(`Found Cast device: ${device.name} at ${device.host}`);
      });

      this.browser.on("serviceDown", (service) => {
        const deviceHost = service.addresses[0];
        this.devices.delete(deviceHost);
        this.disconnectClient(deviceHost);
        // logger.info(`Cast device removed: ${service.name}`);
      });

      this.browser.start();
      // logger.info("Cast service started");
    } catch (error) {
      // logger.error("Failed to start Cast service:", error);
    }
  }

  async connectToDevice(host) {
    return new Promise((resolve, reject) => {
      const client = new Client();

      client.connect(host, () => {
        this.activeConnections.set(host, client);
        // logger.info(`Connected to Cast device at ${host}`);
        resolve(client);
      });

      client.on("error", (error) => {
        // logger.error(`Cast client error for ${host}:`, error);
        this.disconnectClient(host);
        reject(error);
      });
    });
  }

  async play(host, mediaUrl, metadata = {}) {
    try {
      let client = this.activeConnections.get(host);

      if (!client) {
        client = await this.connectToDevice(host);
      }

      return new Promise((resolve, reject) => {
        client.launch(DefaultMediaReceiver, (err, player) => {
          if (err) {
            // logger.error("Failed to launch media player:", err);
            return reject(err);
          }

          const media = {
            contentId: mediaUrl,
            contentType: "audio/mp3",
            streamType: "BUFFERED",
            metadata: {
              type: 0,
              metadataType: 0,
              title: metadata.title || "Unknown Title",
              artist: metadata.artist || "Unknown Artist",
              images: metadata.images || [],
            },
          };

          player.load(media, { autoplay: true }, (err, status) => {
            if (err) {
              // logger.error("Failed to load media:", err);
              return reject(err);
            }
            // logger.info(`Media playing on device ${host}`);
            resolve(status);
          });
        });
      });
    } catch (error) {
      // logger.error("Error playing media:", error);
      throw error;
    }
  }

  async stop(host) {
    const client = this.activeConnections.get(host);
    if (client) {
      return new Promise((resolve, reject) => {
        client.stop(client.session, (err) => {
          if (err) {
            // logger.error(`Failed to stop casting on ${host}:`, err);
            reject(err);
          } else {
            // logger.info(`Stopped casting on ${host}`);
            resolve();
          }
        });
      });
    }
  }

  disconnectClient(host) {
    const client = this.activeConnections.get(host);
    if (client) {
      client.close();
      this.activeConnections.delete(host);
      // logger.info(`Disconnected from Cast device at ${host}`);
    }
  }

  getDevices() {
    return Array.from(this.devices.values());
  }

  stop() {
    if (this.browser) {
      this.browser.stop();
    }

    for (const [host] of this.activeConnections) {
      this.disconnectClient(host);
    }

    // logger.info("Cast service stopped");
  }
}

module.exports = new CastService();
