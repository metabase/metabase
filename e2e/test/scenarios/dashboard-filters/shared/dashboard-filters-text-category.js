export const DASHBOARD_TEXT_FILTERS = [
  {
    operator: "Is",
    single: true,
    value: "Organic",
    representativeResult: "39.58",
  },
  {
    operator: "Is not",
    single: true,
    value: "Organic",
    representativeResult: "37.65",
  },
  // It is important to keep multiple values as a single string in the value field.
  {
    operator: "Contains",
    value: "oo,aa",
    representativeResult: "148.23",
    negativeAssertion: "37.65",
  },
  {
    operator: "Contains",
    single: true,
    value: "oo,aa",
    representativeResult: "No results!",
    negativeAssertion: "148.23",
  },
  {
    operator: "Does not contain",
    value: "oo,tt",
    representativeResult: "39.58",
    negativeAssertion: "37.65",
  },
  {
    operator: "Does not contain",
    single: true,
    value: "oo,tt",
    representativeResult: "37.65",
    negativeASsertion: "39.58",
  },
  {
    operator: "Starts with",
    value: "A,b",
    representativeResult: "85.72",
    negativeASsertion: "70.15",
  },
  {
    operator: "Starts with",
    single: true,
    value: "A,b",
    representativeResult: "No results!",
    negativeASsertion: "85.72",
  },
  {
    operator: "Ends with",
    value: "e,s",
    representativeResult: "47.68",
    negativeASsertion: "127.88",
  },
  {
    operator: "Ends with",
    single: true,
    value: "e,s",
    representativeResult: "No results!",
    negativeASsertion: "47.68",
  },
];
