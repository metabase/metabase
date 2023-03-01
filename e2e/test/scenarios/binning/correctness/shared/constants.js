export const TIME_OPTIONS = {
  Minute: {
    selected: "by minute",
    representativeValues: ["April 30, 2016, 6:56 PM", "May 10, 2016, 9:38 AM"],
  },
  Hour: {
    selected: "by hour",
    representativeValues: ["April 30, 2016, 6:00 PM", "May 10, 2016, 9:00 AM"],
  },
  Day: {
    selected: "by day",
    representativeValues: ["April 30, 2016", "May 10, 2016"],
  },
  Week: {
    selected: "by week",
    representativeValues: [
      "April 24, 2016 – April 30, 2016",
      "May 8, 2016 – May 14, 2016",
    ],
  },
  Month: {
    selected: "by month",
    representativeValues: ["April, 2016", "May, 2016"],
  },
  Quarter: {
    selected: "by quarter",
    representativeValues: ["Q2 - 2016", "Q1 - 2017", "Q1 - 2018", "Q1 - 2019"],
  },
  Year: {
    selected: "by year",
    representativeValues: ["2016", "2017", "2018", "2019", "2020"],
  },
  "Minute of Hour": {
    selected: "by minute of hour",
    representativeValues: ["0", "5", "8", "13"],
    type: "extended",
  },
  "Hour of Day": {
    selected: "by hour of day",
    representativeValues: ["12:00 AM", "2:00 AM", "12:00 PM", "8:00 PM"],
  },
  "Day of Week": {
    selected: "by day of week",
    representativeValues: ["Saturday", "Tuesday", "Friday", "Sunday"],
  },
  "Day of Month": {
    selected: "by day of month",
    representativeValues: ["5", "10", "15", "30"],
  },
  "Day of Year": {
    selected: "by day of year",
    representativeValues: ["1", "10", "12"],
  },
  "Week of Year": {
    selected: "by week of year",
    representativeValues: ["1st", "2nd", "3rd", "10th"],
  },
  "Month of Year": {
    selected: "by month of year",
    representativeValues: ["January", "June", "December"],
  },
  "Quarter of Year": {
    selected: "by quarter of year",
    representativeValues: ["Q1", "Q2", "Q3", "Q4"],
  },
};

export const LONGITUDE_OPTIONS = {
  "Auto bin": {
    selected: "Auto binned",
    representativeValues: ["170° W", "100° W", "60° W"],
  },
  "Bin every 0.1 degrees": {
    selected: "0.1°",
    representativeValues: null,
  },
  "Bin every 1 degree": {
    selected: "1°",
    representativeValues: ["167° W", "164° W", "67° W"],
  },
  "Bin every 10 degrees": {
    selected: "10°",
    representativeValues: ["170° W", "100° W", "60° W"],
  },
  "Bin every 20 degrees": {
    selected: "20°",
    representativeValues: ["180° W", "160° W", "100° W", "80° W", "60° W"],
  },
};
