export const TIME_OPTIONS = {
  Minute: {
    selected: "by minute",
    firstRows: [
      ["April 30, 2025, 6:56 PM", "1"],
      ["May 4, 2025, 6:29 PM", "1"],
      ["May 6, 2025, 12:28 AM", "1"],
    ],
  },
  Hour: {
    selected: "by hour",
    firstRows: [
      ["April 30, 2025, 6:00 PM", "1"],
      ["May 4, 2025, 6:00 PM", "1"],
      ["May 6, 2025, 12:00 AM", "1"],
    ],
  },
  Day: {
    selected: "by day",
    firstRows: [
      ["April 30, 2025", "1"],
      ["May 4, 2025", "1"],
      ["May 6, 2025", "1"],
    ],
  },
  Week: {
    selected: "by week",
    firstRows: [
      ["April 27, 2025 – May 3, 2025", "1"],
      ["May 4, 2025 – May 10, 2025", "4"],
      ["May 11, 2025 – May 17, 2025", "3"],
    ],
  },
  Month: {
    selected: "by month",
    firstRows: [
      ["April 2025", "1"],
      ["May 2025", "19"],
      ["June 2025", "37"],
    ],
  },
  Quarter: {
    selected: "by quarter",
    firstRows: [
      ["Q2 2025", "57"],
      ["Q3 2025", "235"],
      ["Q4 2025", "452"],
    ],
  },
  Year: {
    selected: "by year",
    firstRows: [
      ["2025", "744"],
      ["2026", "3,610"],
      ["2027", "5,834"],
      ["2028", "6,578"],
      ["2029", "1,994"],
    ],
  },
  "Minute of hour": {
    selected: "by minute of hour",
    firstRows: [
      ["0", "297"],
      ["1", "313"],
      ["2", "295"],
    ],
    isHiddenByDefault: true,
  },
  "Hour of day": {
    selected: "by hour of day",
    firstRows: [
      ["12:00 AM", "766"],
      ["1:00 AM", "807"],
      ["2:00 AM", "741"],
    ],
    isHiddenByDefault: true,
  },
  "Day of week": {
    selected: "by day of week",
    firstRows: [
      ["Sunday", "2,678"],
      ["Monday", "2,719"],
      ["Tuesday", "2,590"],
    ],
    isHiddenByDefault: true,
  },
  "Day of month": {
    selected: "by day of month",
    firstRows: [
      ["1", "604"],
      ["2", "604"],
      ["3", "582"],
    ],
    isHiddenByDefault: true,
  },
  "Day of year": {
    selected: "by day of year",
    firstRows: [
      ["1", "45"],
      ["2", "56"],
      ["3", "58"],
    ],
    isHiddenByDefault: true,
  },
  "Week of year": {
    selected: "by week of year",
    firstRows: [
      ["1st", "402"],
      ["2nd", "405"],
      ["3rd", "424"],
    ],
    isHiddenByDefault: true,
  },
  "Month of year": {
    selected: "by month of year",
    firstRows: [
      ["January", "1,826"],
      ["February", "1,686"],
      ["March", "1,801"],
    ],
    isHiddenByDefault: true,
  },
  "Quarter of year": {
    selected: "by quarter of year",
    firstRows: [
      ["Q1", "5,313"],
      ["Q2", "4,203"],
      ["Q3", "4,402"],
      ["Q4", "4,842"],
    ],
    isHiddenByDefault: true,
  },
};

// "Bin every 20 degrees" comes first so it is picked from the unselected column.
export const LONGITUDE_OPTIONS = {
  "Bin every 20 degrees": {
    selected: "20°",
    representativeValues: ["180° W", "160° W", "100° W", "80° W", "60° W"],
  },
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
  "Bin every 0.05 degrees": {
    selected: "0.05°",
    representativeValues: null,
    isHiddenByDefault: true,
  },
  "Bin every 0.01 degrees": {
    selected: "0.01°",
    representativeValues: null,
    isHiddenByDefault: true,
  },
  "Bin every 0.005 degrees": {
    selected: "0.005°",
    representativeValues: null,
    isHiddenByDefault: true,
  },
};
