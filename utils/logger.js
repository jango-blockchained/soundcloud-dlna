const logger = {
  info: (message) => console.log(message),
  error: (message) => console.error(message),
  debug: (message) => console.debug(message),
  warn: (message) => console.warn(message),
};

module.exports = logger;
