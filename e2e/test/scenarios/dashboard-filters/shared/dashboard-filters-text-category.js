export const DASHBOARD_TEXT_FILTERS = [
  {
    operator: "Is",
    value: "Organic",
    representativeResult: "39.58",
  },
  {
    operator: "Is not",
    value: "Organic",
    representativeResult: "37.65",
  },
  // It is important to keep multiple values as a single string in the value field.
  {
    operator: "Contains",
    value: "oo,aa",
    representativeResult: "148.23",
  },
  {
    operator: "Does not contain",
    value: "oo,aa",
    representativeResult: "37.65",
  },
  {
    operator: "Starts with",
    value: "A,b",
    representativeResult: "85.72",
  },
  {
    operator: "Ends with",
    value: "e,s",
    representativeResult: "47.68",
  },
];
