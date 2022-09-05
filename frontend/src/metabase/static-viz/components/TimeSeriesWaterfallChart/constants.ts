export const TIME_SERIES_WATERFALL_CHART_TYPE = "timeseries/waterfall";

export const TIME_SERIES_WATERFALL_CHART_DEFAULT_OPTIONS = {
  data: [
    ["2020-10-20", 20],
    ["2020-10-21", 20],
    ["2020-10-22", 100],
    ["2020-10-23", -10],
    ["2020-10-24", 20],
    ["2020-10-25", -30],
    ["2020-10-26", -10],
    ["2020-10-27", 20],
    ["2020-10-28", -15],
  ],
  labels: {
    left: "Count",
    bottom: "Created At",
  },
};
