export const DASHBOARD_DATE_FILTERS = {
  "Month and Year": {
    value: {
      month: "November",
      year: "2016",
    },
    representativeResult: "85.88",
  },
  "Quarter and Year": {
    value: {
      quarter: "Q2",
      year: "2016",
    },
    representativeResult: "44.43",
  },
  "Single Date": {
    value: "15",
    representativeResult: "No results!",
  },
  "Date Range": {
    value: {
      startDate: "13",
      endDate: "15",
    },
    representativeResult: "No results!",
  },
  "Relative Date": {
    value: "Past 7 days",
    representativeResult: "No results!",
  },
  "All Options": {
    value: {
      timeBucket: "years",
    },
    representativeResult: "37.65",
  },
};

export const DASHBOARD_NUMBER_FILTERS = {
  "Equal to": {
    value: "2.07",
    representativeResult: "37.65",
  },
  "Not equal to": {
    value: "2.07",
    representativeResult: "110.93",
  },
  Between: {
    value: ["3", "5"],
    representativeResult: "68.23",
  },
  "Greater than or equal to": {
    value: "6.01",
    representativeResult: "110.93",
  },
  "Less than or equal to": {
    value: "2",
    representativeResult: "29.8",
  },
};

export const DASHBOARD_LOCATION_FILTERS = {
  Dropdown: {
    value: "Abbeville",
    representativeResult: "1510",
  },
  "Is not": {
    value: "Abbeville",
    representativeResult: "37.65",
  },
  Contains: {
    value: "Abb",
    representativeResult: "1510",
  },
  "Does not contain": {
    value: "Abb",
    representativeResult: "37.65",
  },
  "Starts with": {
    value: "Abb",
    representativeResult: "1510",
  },
  "Ends with": {
    value: "y",
    representativeResult: "115.24",
  },
};

export const DASHBOARD_TEXT_FILTERS = {
  Dropdown: {
    value: "Organic",
    representativeResult: "39.58",
  },
  "Is not": {
    value: "Organic",
    representativeResult: "37.65",
  },
  Contains: {
    value: "oo",
    representativeResult: "148.23",
  },
  "Does not contain": {
    value: "oo",
    representativeResult: "37.65",
  },
  "Starts with": {
    value: "A",
    representativeResult: "85.72",
  },
  "Ends with": {
    value: "e",
    representativeResult: "47.68",
  },
};
