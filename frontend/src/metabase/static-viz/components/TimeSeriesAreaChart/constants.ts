export const TIME_SERIES_AREA_CHART_TYPE = "timeseries/area";

export const TIME_SERIES_AREA_CHART_DEFAULT_OPTIONS = {
  data: [
    ["2020-01-10", 10],
    ["2020-06-10", 60],
    ["2020-12-10", 80],
  ],
  settings: {
    x: {
      date_style: "MMM",
    },
  },
  labels: {
    left: "Count",
    bottom: "Created At",
  },
  colors: {
    brand: "#88BF4D",
  },
};
