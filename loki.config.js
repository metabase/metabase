module.exports = {
  diffingEngine: "looks-same",
  storiesFilter: [
    "static-viz",
    "viz",
    "^visualizations/shared",
    "^embed/",
    "^design system",
    "^Inputs/DatePicker Dates range",
    "^Parameters/DatePicker",
    "^Buttons/Button Compact size, custom color",
  ].join("|"),
  configurations: {
    "chrome.laptop": {
      target: "chrome.docker",
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false,
    },
  },
  "looks-same": {
    strict: false,
    antialiasingTolerance: 9,
    tolerance: 9,
  },
};
