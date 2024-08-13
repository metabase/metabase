export const TIME_OPTIONS = {
  Minute: {
    selected: "by minute",
    representativeValues: ["April 30, 2022, 6:56 PM", "May 10, 2022, 9:38 AM"],
  },
  Hour: {
    selected: "by hour",
    representativeValues: ["April 30, 2022, 6:00 PM", "May 10, 2022, 9:00 AM"],
  },
  Day: {
    selected: "by day",
    representativeValues: ["April 30, 2022", "May 10, 2022"],
  },
  Week: {
    selected: "by week",
    representativeValues: [
      "April 24, 2022 – April 30, 2022",
      "May 8, 2022 – May 14, 2022",
    ],
  },
  Month: {
    selected: "by month",
    representativeValues: ["April 2022", "May 2022"],
  },
  Quarter: {
    selected: "by quarter",
    representativeValues: ["Q2 2022", "Q1 2023", "Q1 2024", "Q1 2025"],
  },
  Year: {
    selected: "by year",
    representativeValues: ["2022", "2023", "2024", "2025", "2026"],
  },
  "Minute of hour": {
    selected: "by minute of hour",
    representativeValues: ["0", "5", "8", "13"],
    type: "extended",
    isHiddenByDefault: true,
  },
  "Hour of day": {
    selected: "by hour of day",
    representativeValues: ["12:00 AM", "2:00 AM", "12:00 PM", "8:00 PM"],
    isHiddenByDefault: true,
  },
  "Day of week": {
    selected: "by day of week",
    representativeValues: ["Saturday", "Tuesday", "Friday", "Sunday"],
    isHiddenByDefault: true,
  },
  "Day of month": {
    selected: "by day of month",
    representativeValues: ["5", "10", "15", "30"],
    isHiddenByDefault: true,
  },
  "Day of year": {
    selected: "by day of year",
    representativeValues: ["1", "10", "12"],
    isHiddenByDefault: true,
  },
  "Week of year": {
    selected: "by week of year",
    representativeValues: ["1st", "2nd", "3rd", "10th"],
    isHiddenByDefault: true,
  },
  "Month of year": {
    selected: "by month of year",
    representativeValues: ["January", "June", "December"],
    isHiddenByDefault: true,
  },
  "Quarter of year": {
    selected: "by quarter of year",
    representativeValues: ["Q1", "Q2", "Q3", "Q4"],
    isHiddenByDefault: true,
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
    representativeValues: ["167° W", "159° W", "69° W"],
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
