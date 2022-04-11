export const TIME_SERIES_BAR_CHART_TYPE = "timeseries/bar";

export const TIME_SERIES_BAR_CHART_DEFAULT_OPTIONS = {
  data: [
    ["2020-10-21", 20],
    ["2020-10-22", 30],
    ["2020-10-23", 25],
    ["2020-10-24", 10],
    ["2020-10-25", 15],
  ],
  settings: {
    x: {
      date_style: "MM/DD/YYYY",
    },
    y: {
      number_style: "currency",
      currency: "USD",
      currency_style: "symbol",
      decimals: 0,
    },
  },
  labels: {
    left: "Price",
    bottom: "Created At",
  },
};
