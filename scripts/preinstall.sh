#!/bin/bash

# Exit on any error
set -e

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check and create directories
create_directories() {
    local dirs=("downloads" "temp" "logs")
    for dir in "${dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir"
            log_message "Created directory: $dir"
        fi
    done
}

# Function to install yt-dlp
install_ytdlp() {
    local YT_DLP_PATH
    
    if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
        YT_DLP_PATH="/usr/local/bin/yt-dlp"
        log_message "Installing yt-dlp for Unix-like system..."
        
        # Create directory if it doesn't exist
        sudo mkdir -p "$(dirname "$YT_DLP_PATH")"
        
        # Download and install yt-dlp with retry mechanism
        for i in {1..3}; do
            if sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "$YT_DLP_PATH"; then
                sudo chmod a+rx "$YT_DLP_PATH"
                break
            else
                if [ $i -eq 3 ]; then
                    log_message "Error: Failed to download yt-dlp after 3 attempts"
                    exit 1
                fi
                log_message "Retry $i: Downloading yt-dlp..."
                sleep 2
            fi
        done
        
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        YT_DLP_PATH="$LOCALAPPDATA\\Microsoft\\WindowsApps\\yt-dlp.exe"
        log_message "Installing yt-dlp for Windows..."
        
        # Create directory if it doesn't exist
        mkdir -p "$(dirname "$YT_DLP_PATH")"
        
        # Download yt-dlp for Windows with retry mechanism
        for i in {1..3}; do
            if curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o "$YT_DLP_PATH"; then
                break
            else
                if [ $i -eq 3 ]; then
                    log_message "Error: Failed to download yt-dlp after 3 attempts"
                    exit 1
                fi
                log_message "Retry $i: Downloading yt-dlp..."
                sleep 2
            fi
        done
    else
        log_message "Error: Unsupported operating system"
        exit 1
    fi
    
    # Verify yt-dlp installation
    if [ ! -f "$YT_DLP_PATH" ]; then
        log_message "Error: yt-dlp installation failed"
        exit 1
    fi
    
    # Update config.json with the correct yt-dlp path
    local CONFIG_PATH
    CONFIG_PATH="$(dirname "$(dirname "$0")")/config.json"
    
    if [ -f "$CONFIG_PATH" ]; then
        # Use sed for Unix systems
        if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sed -i.bak "s|\"path\": \"\"|\"path\": \"$YT_DLP_PATH\"|" "$CONFIG_PATH"
            rm "${CONFIG_PATH}.bak"
        # Use powershell for Windows systems
        elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
            powershell -Command "(Get-Content '$CONFIG_PATH') -replace '\"path\": \"\"', '\"path\": \"${YT_DLP_PATH//\\/\\\\}\"' | Set-Content '$CONFIG_PATH'"
        fi
        log_message "Updated config.json with yt-dlp path: $YT_DLP_PATH"
    else
        log_message "Error: config.json not found at $CONFIG_PATH"
        exit 1
    fi
    
    log_message "yt-dlp installed successfully at: $YT_DLP_PATH"
}

# Function to install FFmpeg
install_ffmpeg() {
    if command -v ffmpeg &> /dev/null; then
        log_message "FFmpeg is already installed"
        return 0
    fi
    
    log_message "Installing FFmpeg..."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! command -v brew &> /dev/null; then
            log_message "Error: Homebrew is required to install FFmpeg on macOS"
            log_message "Please install Homebrew first: https://brew.sh"
            exit 1
        fi
        brew install ffmpeg
        
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y ffmpeg
        elif command -v yum &> /dev/null; then
            sudo yum install -y ffmpeg
        else
            log_message "Error: Unsupported Linux distribution"
            exit 1
        fi
        
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        log_message "Please install FFmpeg manually on Windows from: https://ffmpeg.org/download.html"
        log_message "After installation, make sure to add FFmpeg to your system's PATH"
        exit 1
    fi
    
    # Verify FFmpeg installation
    if ! command -v ffmpeg &> /dev/null; then
        log_message "Error: FFmpeg installation failed"
        exit 1
    fi
    
    log_message "FFmpeg installed successfully"
}

# Function to check for Node.js version
check_node_version() {
    if ! command -v node &> /dev/null; then
        log_message "Error: Node.js is not installed"
        log_message "Please install Node.js v18 or later from: https://nodejs.org/"
        exit 1
    fi

    local node_version
    node_version=$(node -v | cut -d 'v' -f 2)
    local major_version
    major_version=$(echo "$node_version" | cut -d '.' -f 1)

    if [ "$major_version" -lt 18 ]; then
        log_message "Error: Node.js version 18 or later is required"
        log_message "Current version: $node_version"
        log_message "Please upgrade Node.js from: https://nodejs.org/"
        exit 1
    fi

    log_message "Node.js version $node_version detected"
}

# Function to check and install curl if needed
check_curl() {
    if ! command -v curl &> /dev/null; then
        log_message "Installing curl..."
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            if command -v apt-get &> /dev/null; then
                sudo apt-get update && sudo apt-get install -y curl
            elif command -v yum &> /dev/null; then
                sudo yum install -y curl
            fi
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            brew install curl
        fi
    fi
}

# Function to check and configure permissions
configure_permissions() {
    local dirs=("downloads" "temp" "logs")
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            chmod 755 "$dir"
            log_message "Set permissions for directory: $dir"
        fi
    done
}

# Function to verify system requirements
verify_system_requirements() {
    local min_space_mb=500
    local available_space
    
    if [[ "$OSTYPE" == "darwin"* ]] || [[ "$OSTYPE" == "linux-gnu"* ]]; then
        available_space=$(df -m . | awk 'NR==2 {print $4}')
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
        available_space=$(df -m . | awk 'NR==2 {print $4}')
    fi

    if [ "$available_space" -lt "$min_space_mb" ]; then
        log_message "Error: Insufficient disk space. Required: ${min_space_mb}MB, Available: ${available_space}MB"
        exit 1
    fi
}

# Function to setup Avahi
setup_avahi() {
    log_message "Setting up Avahi..."
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Install Avahi and required packages
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            sudo apt-get install -y avahi-daemon avahi-discover libnss-mdns libavahi-compat-libdnssd-dev
        elif command -v yum &> /dev/null; then
            sudo yum install -y avahi avahi-tools nss-mdns avahi-compat-libdns_sd-devel
        fi

        # Enable and start Avahi daemon
        if command -v systemctl &> /dev/null; then
            sudo systemctl enable avahi-daemon
            sudo systemctl start avahi-daemon
            log_message "Avahi daemon enabled and started"
        else
            sudo service avahi-daemon start
            log_message "Avahi daemon started"
        fi

        # Configure NSSwitch if needed
        if [ -f "/etc/nsswitch.conf" ]; then
            if ! grep -q "mdns_minimal \[NOTFOUND=return\]" /etc/nsswitch.conf; then
                sudo sed -i '/^hosts:/ s/$/ mdns_minimal [NOTFOUND=return]/' /etc/nsswitch.conf
                log_message "Updated nsswitch.conf for mDNS resolution"
            fi
        fi
    fi
}

# Main execution
main() {
    log_message "Starting preinstall script..."
    
    verify_system_requirements
    check_curl
    check_node_version
    create_directories
    configure_permissions
    install_ytdlp
    install_ffmpeg
    setup_avahi
    
    log_message "Preinstall completed successfully!"
}

# Run main function
main
