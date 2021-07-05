export const STRING_FILTER_SUBTYPES = {
  String: {
    value: "Synergistic Granite Chair",
    representativeResult: "Synergistic Granite Chair",
  },
  "String is not": {
    value: "Synergistic Granite Chair",
    representativeResult: "Rustic Paper Wallet",
  },
  "String contains": {
    value: "Bronze",
    representativeResult: "Incredible Bronze Pants",
  },
  "String does not contain": {
    value: "Bronze",
    representativeResult: "Rustic Paper Wallet",
  },
  "String starts with": {
    value: "Rustic",
    representativeResult: "Rustic Paper Wallet",
  },
  "String ends with": {
    value: "Hat",
    representativeResult: "Small Marble Hat",
  },
};

export const NUMBER_FILTER_SUBTYPES = {
  "Equal to": {
    value: "4.3",
    representativeResult: "Aerodynamic Linen Coat",
  },
  "Not equal to": {
    value: "4.3",
    representativeResult: "Rustic Paper Wallet",
  },
  Between: {
    value: ["4.3", "5"],
    representativeResult: "Rustic Paper Wallet",
  },
  "Greater than or equal to": {
    value: "4.3",
    representativeResult: "Rustic Paper Wallet",
  },
  "Less than or equal to": {
    value: "4.3",
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
