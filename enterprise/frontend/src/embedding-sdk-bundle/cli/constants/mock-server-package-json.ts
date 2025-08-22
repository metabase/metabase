export const MOCK_SERVER_PACKAGE_JSON = {
  name: "mock-server",
  version: "1.0.0",
  main: "server.js",
  scripts: {
    start: "node server.js",
  },
  license: "MIT",
  dependencies: {
    cors: "^2.8.5",
    express: "^4.19.2",
    "express-session": "^1.18.0",
    jsonwebtoken: "^9.0.2",
    "node-fetch": "^2.7.0",
  },
  resolutions: {
    "whatwg-url": "^14.0.0",
  },
};
