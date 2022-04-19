export const DASHBOARD_SQL_TEXT_FILTERS = {
  Dropdown: {
    sqlFilter: "string/=",
    value: "Gizmo",
    representativeResult: "Rustic Paper Wallet",
  },
  "Is not": {
    sqlFilter: "string/!=",
    value: "Gadget",
    representativeResult: "Rustic Paper Wallet",
  },
  Contains: {
    sqlFilter: "string/contains",
    value: "oo",
    representativeResult: "Small Marble Shoes",
  },
  "Does not contain": {
    sqlFilter: "string/does-not-contain",
    value: "oo",
    representativeResult: "Rustic Paper Wallet",
  },
  "Starts with": {
    sqlFilter: "string/starts-with",
    value: "G",
    representativeResult: "Rustic Paper Wallet",
  },
  "Ends with": {
    sqlFilter: "string/ends-with",
    value: "y",
    representativeResult: "Small Marble Shoes",
  },
};

export const DASHBOARD_SQL_NUMBER_FILTERS = {
  "Equal to": {
    sqlFilter: "number/=",
    value: "3.8",
    representativeResult: "Small Marble Hat",
  },
  "Not equal to": {
    sqlFilter: "number/!=",
    value: "2.07",
    representativeResult: "Rustic Paper Wallet",
  },
  Between: {
    sqlFilter: "number/between",
    value: ["3", "4"],
    representativeResult: "Small Marble Hat",
  },
  "Greater than or equal to": {
    sqlFilter: "number/>=",
    value: "4.3",
    representativeResult: "Aerodynamic Linen Coat",
  },
  "Less than or equal to": {
    sqlFilter: "number/<=",
    value: "3",
    representativeResult: "Enormous Aluminum Shirt",
  },
};

export const DASHBOARD_SQL_LOCATION_FILTERS = {
  Dropdown: {
    sqlFilter: "string/=",
    value: "Rye",
    representativeResult: "Arnold Adams",
  },
  "Is not": {
    sqlFilter: "string/!=",
    value: "Rye",
    representativeResult: "Hudson Borer",
  },
  Contains: {
    sqlFilter: "string/contains",
    value: "oo",
    representativeResult: "Hudson Borer",
  },
  "Does not contain": {
    sqlFilter: "string/does-not-contain",
    value: "oo",
    representativeResult: "Domenica Williamson",
  },
  "Starts with": {
    sqlFilter: "string/starts-with",
    value: "W",
    representativeResult: "Hudson Borer",
  },
  "Ends with": {
    sqlFilter: "string/ends-with",
    value: "g",
    representativeResult: "Aracely Jenkins",
  },
};

export const DASHBOARD_SQL_DATE_FILTERS = {
  "Month and Year": {
    sqlFilter: "date/month-year",
    value: {
      month: "October",
      year: "2017",
    },
    representativeResult: "Hudson Borer",
  },
  "Quarter and Year": {
    sqlFilter: "date/quarter-year",
    value: {
      quarter: "Q1",
      year: "2018",
    },
    representativeResult: "Lolita Schaefer",
  },
  "Single Date": {
    sqlFilter: "date/single",
    value: "15",
    representativeResult: "No results!",
  },
  "Date Range": {
    sqlFilter: "date/range",
    value: {
      startDate: "13",
      endDate: "15",
    },
    representativeResult: "No results!",
  },
  "Relative Date": {
    sqlFilter: "date/relative",
    value: "Past 7 days",
    representativeResult: "No results!",
  },
  "All Options": {
    sqlFilter: "date/all-options",
    value: {
      timeBucket: "years",
    },
    representativeResult: "Hudson Borer",
  },
};
