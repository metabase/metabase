export const DASHBOARD_DATE_FILTERS = {
  "Month and Year": {
    value: {
      month: "Nov",
      year: "2025",
    },
    representativeResult: "85.88",
  },
  "Quarter and Year": {
    value: {
      quarter: "Q2",
      year: "2025",
    },
    representativeResult: "44.43",
  },
  "Single Date": {
    value: "05/23/2025",
    representativeResult: "49.54",
  },
  "Date Range": {
    value: {
      startDate: "05/25/2025",
      endDate: "06/01/2025",
    },
    representativeResult: "75.41",
  },
  "All Options": {
    value: {
      timeBucket: "years",
    },
    representativeResult: "79.37", // this may change every year
  },
};
