const config = {
  ROOT_DIR: "../../cypress",
  SCREENSHOTS_DIR: "snapshots",
  NAME_TEMPLATE: "[browserName]/[specName]-[givenName]",
  REPORT_DIR: "report",
  JSON_REPORT: {
    FILENAME: "report",
    OVERWRITE: true,
  },
};

module.exports = config;
