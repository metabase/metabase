module.exports = {
  diffingEngine: "looks-same",
  storiesFilter: "static-viz|viz|^visualizations/shared|^visualizations/Table",
  configurations: {
    "chrome.laptop": {
      target: "chrome.docker",
      width: 1366,
      height: 768,
      deviceScaleFactor: 2,
      mobile: false,
    },
  },
  "looks-same": {
    strict: false,
    tolerance: 4,
    antialiasingTolerance: 4,
    ignoreAntialiasing: true,
    ignoreCaret: true,
  },
};
