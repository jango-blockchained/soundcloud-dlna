# SoundCloud to DLNA Streamer

A Node.js application that downloads SoundCloud tracks and streams them to DLNA devices. It includes features for browser playback, metadata handling, and flexible storage options.

## Features

- Download tracks from SoundCloud with automatic metadata handling
- Stream music to DLNA-compatible devices (TVs, speakers, etc.)
- Browser-based playback interface with playlist support
- Automatic metadata tagging and organization
- Flexible storage options (local disk or NAS)
- Queue management and download scheduling
- Real-time download progress tracking
- Support for multiple audio formats (MP3, WAV, FLAC)

## Prerequisites

- Node.js (v18 or later)
- yt-dlp (required for downloading)
- FFmpeg (for audio conversion)
- DLNA-compatible devices on your network

## Installation

### Automatic Installation (Recommended)

1. Clone the repository:

```bash
git clone https://github.com/jango-blockchained/soundcloud-dlna-streamer
cd soundcloud-dlna-streamer
```

2. Run the preinstall script to set up system dependencies:

```bash
chmod +x scripts/preinstall.sh
./scripts/preinstall.sh
```

3. Install project dependencies:

```bash
npm install
```

### Manual Installation

If you prefer to install prerequisites manually, follow these steps:

1. Install Node.js (v18 or later):
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. Install yt-dlp:
   - **Linux/macOS**:

   ```bash
   sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
   sudo chmod a+rx /usr/local/bin/yt-dlp
   ```

   - **Windows**: Download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and add to PATH

3. Install FFmpeg:
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `sudo apt-get install ffmpeg` or `sudo yum install ffmpeg`
   - **Windows**: Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to PATH

4. Create required directories:

```bash
mkdir -p downloads temp logs
```

## Configuration

1. Copy the example configuration file:

```bash
cp config.example.json config.json
```

2. Edit `config.json` to set your preferences:

```json
{
    "server": {
        "port": 3000,
        "host": "0.0.0.0"
    },
    "storage": {
        "downloadPath": "./downloads",
        "tempPath": "./temp",
        "logPath": "./logs"
    },
    "ytdlp": {
        "path": "",  // Will be automatically set by preinstall script
        "format": "bestaudio",
        "maxConcurrentDownloads": 3
    },
    "dlna": {
        "enabled": true,
        "serverPort": 8200
    },
    "logging": {
        "level": "info",
        "format": "combined"
    },
    "security": {
        "rateLimit": {
            "enabled": true,
            "windowMs": 900000,  // 15 minutes
            "max": 100
        },
        "cors": {
            "enabled": false,
            "origin": "*"
        }
    }
}
```

## Usage

1. Start the server:

```bash
npm start
```

or

```bash
node server.js
```

2. Access the web interface at `http://localhost:3000`

3. Enter a SoundCloud URL to download and stream

## API Endpoints

- `GET /api/tracks` - List all downloaded tracks
- `POST /api/download` - Queue a new track download

  ```json
  {
    "url": "https://soundcloud.com/artist/track"
  }
  ```

- `GET /api/devices` - List available DLNA devices
- `POST /api/stream` - Start streaming to a DLNA device

  ```json
  {
    "deviceId": "uuid:device-id",
    "trackId": "track-filename"
  }
  ```

- `GET /api/status` - Get current server status
- `GET /api/queue` - Get download queue status

## API Endpoints Overview

### Download Management

- `POST /download`
  - Download audio from URL
  - Body: `{ "url": "string", "receiverIp": "string?", "storage": "local|nas" }`

### File Management

- `GET /files`
  - List all downloaded files
  - Query params: `sort`, `order`, `filter`
- `GET /files/:filename`
  - Get detailed file information
- `DELETE /files/:filename`
  - Delete a specific file
- `PUT /files/:filename`
  - Rename a file
  - Body: `{ "newName": "string" }`
- `GET /files/local`
  - Get list of local files
- `POST /files/delete`
  - Delete a file
  - Body: `{ "path": "string" }`

### DLNA/DMR Control

- `GET /dmr/devices`
  - List available DMR devices
- `POST /dmr/stop`
  - Stop playback on DMR device
  - Body: `{ "host": "string" }`

### Google Cast Support

- `GET /cast/devices`
  - List available Google Cast devices
- `POST /cast/play`
  - Play media on Cast device
  - Body:

    ```json
    {
      "host": "string",
      "mediaUrl": "string",
      "metadata": {
        "title": "string",
        "artist": "string",
        "album": "string"
      }
    }
    ```

- `POST /cast/stop`
  - Stop playback on Cast device
  - Body: `{ "host": "string" }`

### System Configuration

- `POST /set-download-path`
  - Set custom download directory
  - Body: `{ "path": "string" }`
- `GET /api/status`
  - Get server status and configuration

## Streaming Technologies

### DLNA/DMR Support

The application supports DLNA (Digital Living Network Alliance) and DMR (Digital Media Renderer) devices for streaming audio content across your local network. This allows playback on compatible smart TVs, speakers, and other media devices.

### Google Cast Integration

The application now includes support for Google Cast devices, enabling streaming to:

- Chromecast devices
- Google Home speakers
- Other Cast-enabled devices

Features:

- Auto-discovery of Cast devices on the network
- Media metadata support
- Playback control (play, stop)
- Real-time status updates

To use Google Cast features:

1. Ensure your Cast device is on the same network
2. Use the web interface or API endpoints to:
   - List available Cast devices
   - Select a device for playback
   - Control media playback

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for download capabilities
- [node-dlna](https://github.com/sarfata/node-dlna) for DLNA streaming
- SoundCloud for their platform and API

## Support

For support, please open an issue in the GitHub repository or contact the maintainers.

## Troubleshooting

### Common Issues

1. **yt-dlp not found**
   - Verify the path in config.json
   - Run `which yt-dlp` to find the correct path
   - Try reinstalling: `./scripts/preinstall.sh`

2. **FFmpeg errors**
   - Ensure FFmpeg is in your system PATH
   - For Windows users: Restart your system after FFmpeg installation
   - Run `ffmpeg -version` to verify installation

3. **DLNA devices not found**
   - Ensure devices are on the same network
   - Check firewall settings
   - Verify DLNA/UPnP is enabled on your devices

4. **Permission errors**
   - Ensure write permissions for downloads/temp/logs directories
   - Run `chmod -R 755 ./downloads ./temp ./logs`

For other issues, check the logs in `./logs` directory or open an issue on GitHub.
