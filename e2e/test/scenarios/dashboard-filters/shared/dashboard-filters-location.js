export const DASHBOARD_LOCATION_FILTERS = {
  Is: {
    value: "Abbeville",
    representativeResult: "1510",
  },
  "Is not": {
    value: "Wood River",
    representativeResult: "148.23",
  },
  Contains: {
    value: "bbev",
    representativeResult: "1510",
  },
  "Does not contain": {
    value: "d",
    representativeResult: "47.68",
    negativeAssertion: "148.23",
  },
  "Starts with": {
    value: "Lake",
    representativeResult: "122.37",
    negativeAssertion: "67.83",
  },
  "Ends with": {
    value: "y",
    representativeResult: "115.24",
  },
};
