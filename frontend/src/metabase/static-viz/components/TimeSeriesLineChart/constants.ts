export const TIME_SERIES_LINE_CHART_TYPE = "timeseries/line";

export const TIME_SERIES_LINE_CHART_DEFAULT_OPTIONS = {
  data: [
    ["2020-01-10", 10],
    ["2020-06-10", 60],
    ["2020-12-10", 80],
  ],
  accessors: {
    x: (row: any[]) => new Date(row[0]).valueOf(),
    y: (row: any[]) => row[1],
  },
  labels: {
    left: "Count",
    bottom: "Created At",
  },
};
