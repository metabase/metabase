import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE } = SAMPLE_DATABASE;

export const questionDetails = {
  name: "SQL with Field Filter",
  native: {
    query:
      "select PEOPLE.NAME, PEOPLE.CITY from PEOPLE where true \n[[AND {{is}}]] \n[[AND {{not}}]] \n[[AND {{contains}}]] \n[[AND {{doesntcontain}}]] \n[[AND {{startswith}}]] \n[[AND {{endswith}}]] limit 10",
    "template-tags": {
      is: {
        id: "bcd8b984-2e16-ffa4-82fc-2895ac8570f9",
        name: "is",
        "display-name": "Is",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/=",
        default: null,
      },
      not: {
        id: "c057de9d-dbba-3e93-1882-4409fa00629c",
        name: "not",
        "display-name": "Is not",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/!=",
        default: null,
      },
      contains: {
        id: "df86d80a-6575-996d-fd40-d2a4b8eb2a17",
        name: "contains",
        "display-name": "Contains",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/contains",
        default: null,
      },
      doesntcontain: {
        id: "ffe304fc-6c7b-6e70-d49d-33c91883e592",
        name: "doesntcontain",
        "display-name": "Does not contain",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/does-not-contain",
        default: null,
      },
      startswith: {
        id: "80e0894d-015a-ca28-8c4a-3b2ac4759507",
        name: "startswith",
        "display-name": "Starts with",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/starts-with",
        default: null,
      },
      endswith: {
        id: "25d5d9cf-bb95-2d56-507d-79d0d04fb314",
        name: "endswith",
        "display-name": "Ends with",
        type: "dimension",
        dimension: ["field", PEOPLE.CITY, null],
        "widget-type": "string/ends-with",
        default: null,
      },
    },
  },
};

export const DASHBOARD_SQL_LOCATION_FILTERS = {
  Is: {
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
