export const CATEGORICAL_LINE_CHART_TYPE = "categorical/line";

export const CATEGORICAL_LINE_CHART_DEFAULT_OPTIONS = {
  data: [
    ["Alden Sparks", 70],
    ["Areli Guerra", 30],
    ["Arturo Hopkins", 80],
    ["Beatrice Lane", 120],
    ["Brylee Davenport", 100],
    ["Cali Nixon", 60],
    ["Dane Terrell", 150],
    ["Deshawn Rollins", 40],
    ["Isabell Bright", 70],
    ["Kaya Rowe", 20],
    ["Roderick Herman", 50],
    ["Ruth Dougherty", 75],
  ],
  accessors: {
    x: (row: any[]) => row[0],
    y: (row: any[]) => row[1],
  },
  labels: {
    left: "Tasks",
    bottom: "People",
  },
};
