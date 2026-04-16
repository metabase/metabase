export const DASHBOARD_DATE_FILTERS = {
  "Month and Year": {
    value: {
      month: "Nov",
      year: "2028",
    },
    representativeResult: "85.88",
  },
  "Quarter and Year": {
    value: {
      quarter: "Q2",
      year: "2028",
    },
    representativeResult: "44.43",
  },
  "Single Date": {
    value: "05/23/2028",
    representativeResult: "49.54",
  },
  "Date Range": {
    value: {
      startDate: "05/25/2028",
      endDate: "06/01/2028",
    },
    representativeResult: "75.41",
  },
  "All Options": {
    value: {
      timeBucket: "years",
    },
    representativeResult: "67.33", // this may change every year
  },
};
