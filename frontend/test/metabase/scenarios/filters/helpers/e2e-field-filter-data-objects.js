export const STRING_FILTER_SUBTYPES = {
  String: {
    term: "Synergistic Granite Chair",
    representativeResult: "Synergistic Granite Chair",
  },
  "String is not": {
    term: "Synergistic Granite Chair",
    representativeResult: "Rustic Paper Wallet",
  },
  "String contains": {
    term: "Bronze",
    representativeResult: "Incredible Bronze Pants",
  },
  "String does not contain": {
    term: "Bronze",
    representativeResult: "Rustic Paper Wallet",
  },
  "String starts with": {
    term: "Rustic",
    representativeResult: "Rustic Paper Wallet",
  },
  "String ends with": {
    term: "Hat",
    representativeResult: "Small Marble Hat",
  },
};

export const NUMBER_FILTER_SUBTYPES = {
  "Equal to": {
    term: "4.3",
    representativeResult: "Aerodynamic Linen Coat",
  },
  "Not equal to": {
    term: "4.3",
    representativeResult: "Rustic Paper Wallet",
  },
  Between: {
    term: ["4.3", "5"],
    representativeResult: "Rustic Paper Wallet",
  },
  "Greater than or equal to": {
    term: "4.3",
    representativeResult: "Rustic Paper Wallet",
  },
  "Less than or equal to": {
    term: "4.3",
    representativeResult: "Small Marble Shoes",
  },
};

export const DATE_FILTER_SUBTYPES = {
  "Month and Year": {
    value: {
      month: "September",
      year: "2017",
    },
    representativeResult: "Durable Steel Toucan",
  },
  "Quarter and Year": {
    value: {
      quarter: "Q2",
      year: "2017",
    },
    representativeResult: "Aerodynamic Linen Coat",
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
  "Date Filter": {
    value: {
      timeBucket: "Years",
    },
    representativeResult: "Small Marble Shoes",
  },
};
