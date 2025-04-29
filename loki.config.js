module.exports = {
  diffingEngine: "looks-same",
  storiesFilter: [
    "DataGrid",
    "static-viz",
    "viz",
    "^visualizations/shared",
    "^app/embed",
    "^design system",
    "^Patterns/Overlays",
    "^Components/Inputs/DatePicker Dates range",
    "^Components/Parameters/DatePicker",
    "^Components/Buttons/Button Compact size, custom color",
    "^Components/overlays/Tooltip",
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
