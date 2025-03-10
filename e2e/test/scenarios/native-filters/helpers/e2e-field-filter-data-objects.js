import dayjs from "dayjs";

export const STRING_FILTER_SUBTYPES = {
  String: {
    searchTerm: "Synerg",
    value: "Synergistic Granite Chair",
    representativeResult: "Synergistic Granite Chair",
    isList: true,
  },
  "String is not": {
    searchTerm: "Synerg",
    value: "Synergistic Granite Chair",
    representativeResult: "Rustic Paper Wallet",
    isList: true,
  },
  "String contains": {
    searchTerm: null,
    value: "bronze",
    representativeResult: "Incredible Bronze Pants",
  },
  "String does not contain": {
    searchTerm: null,
    value: "bronze",
    representativeResult: "Rustic Paper Wallet",
  },
  "String starts with": {
    searchTerm: null,
    value: "Rustic",
    representativeResult: "Rustic Paper Wallet",
  },
  "String ends with": {
    searchTerm: null,
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
      month: "Sep",
      year: "2022",
    },
    representativeResult: "Aerodynamic Paper Computer",
  },
  "Quarter and Year": {
    value: {
      quarter: "Q2",
      year: "2022",
    },
    representativeResult: "Synergistic Steel Chair",
  },
  "Single Date": {
    value: "05/24/2022",
    representativeResult: "Synergistic Steel Chair",
  },
  "Date Range": {
    value: {
      startDate: "05/25/2022",
      endDate: "06/01/2022",
    },
    representativeResult: "Gorgeous Wooden Car",
  },
  "All Options": {
    value: {
      timeBucket: "month",
      quantity:
        // When the filter is "Previous N months", we must ensure that N is large
        // enough that the representative result appears. For this filter, the
        // representative result is Synergistic Steel Chair, created on May 24,
        // 2022.
        dayjs().diff(dayjs("2022-05-24"), "month") + 2,
    },
    representativeResult: "Synergistic Steel Chair",
  },
};
