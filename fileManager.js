const fs = require("fs");
const path = require("path");

class FileManager {
  constructor() {
    this.downloadDir = path.join(__dirname, "downloads");
    // Create downloads directory if it doesn't exist
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  getLocalFiles() {
    try {
      const files = fs.readdirSync(this.downloadDir);
      return files.map((filename) => {
        const filePath = path.join(this.downloadDir, filename);
        const stats = fs.statSync(filePath);
        return {
          name: filename,
          path: filePath,
          size: stats.size,
        };
      });
    } catch (error) {
      console.error("Error reading local files:", error);
      throw error;
    }
  }

  deleteFile(filePath) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (error) {
      console.error("Error deleting file:", error);
      throw error;
    }
  }
}

module.exports = new FileManager();
