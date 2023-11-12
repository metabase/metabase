module.exports = {
  diffingEngine: "pixelmatch",
  storiesFilter: "static-viz",
  configurations: {
    "chrome.laptop": {
      target: "chrome.docker",
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    },
  },
};
