export const CATEGORICAL_WATERFALL_CHART_TYPE = "categorical/waterfall";

export const CATEGORICAL_WATERFALL_CHART_DEFAULT_OPTIONS = {
  data: [
    ["Stage 1", 800],
    ["Stage 2", 400],
    ["Stage 3", -300],
    ["Stage 4", -100],
    ["Stage 5", -50],
    ["Stage 6", 200],
    ["Stage 7", -100],
    ["Stage 8", 300],
    ["Stage 9", 100],
    ["Stage 10", -300],
  ],
  settings: {
    showTotal: true,
  },
  labels: {
    left: "Count",
    bottom: "Created At",
  },
};
