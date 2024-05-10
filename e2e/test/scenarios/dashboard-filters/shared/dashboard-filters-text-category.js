export const DASHBOARD_TEXT_FILTERS = {
  Is: {
    value: "Organic",
    representativeResult: "39.58",
  },
  "Is not": {
    value: "Organic",
    representativeResult: "37.65",
  },
  // It is important to keep multiple values as a single string in the value field.
  Contains: {
    value: "oo,aa",
    representativeResult: "148.23",
  },
  "Does not contain": {
    value: "oo,aa",
    representativeResult: "37.65",
  },
  "Starts with": {
    value: "A,b",
    representativeResult: "85.72",
  },
  "Ends with": {
    value: "e,s",
    representativeResult: "47.68",
  },
};
