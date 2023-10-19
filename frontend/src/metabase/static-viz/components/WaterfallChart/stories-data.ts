import { color } from "metabase/lib/colors";

export const TIMESERIES = {
  getColor: color,
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
  settings: {
    show_values: true,
  },
  labels: {
    left: "Count",
    bottom: "Created At",
  },
  type: "timeseries",
};

export const CATEGORICAL = {
  getColor: color,
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
    show_values: true,
  },
  labels: {
    left: "Count",
    bottom: "Created At",
  },
  type: "categorical",
};
