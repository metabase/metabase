export const CATEGORICAL_DONUT_CHART_TYPE = "categorical/donut";

export const CATEGORICAL_DONUT_CHART_DEFAULT_OPTIONS = {
  data: [
    ["donut", 2000],
    ["cronut", 3100],
  ],
  colors: {
    donut: "#509EE3",
    cronut: "#DDECFA",
  },
  accessors: {
    dimension: (row: any[]) => row[0],
    metric: (row: any[]) => row[1],
  },
};
