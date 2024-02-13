export const DASHBOARD_DATE_FILTERS = {
  "Month and Year": {
    value: {
      month: "November",
      year: "2022",
    },
    representativeResult: "85.88",
  },
  "Quarter and Year": {
    value: {
      quarter: "Q2",
      year: "2022",
    },
    representativeResult: "44.43",
  },
  "Single Date": {
    value: "05/23/2022",
    representativeResult: "49.54",
  },
  "Date Range": {
    value: {
      startDate: "05/25/2022",
      endDate: "06/01/2022",
    },
    representativeResult: "75.41",
  },
  "All Options": {
    value: {
      timeBucket: "years",
    },
    representativeResult: "51.19", // this may change every year
  },
};
