import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS } = SAMPLE_DATABASE;

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

export const questionDetails = {
  name: "SQL with number filter",
  native: {
    query:
      "select PRODUCTS.TITLE, PRODUCTS.RATING from PRODUCTS where true \n[[AND {{equal}}]] \n[[AND {{notEqual}}]] \n[[AND {{between}}]] \n[[AND {{gteq}}]] \n[[AND {{lteq}}]]",
    "template-tags": {
      equal: {
        id: "197c0532-e2f8-24be-8d71-757369d3a75f",
        name: "equal",
        "display-name": "Equal to",
        type: "dimension",
        dimension: ["field", PRODUCTS.RATING, null],
        "widget-type": "number/=",
        default: null,
      },
      notEqual: {
        id: "827ca517-e493-397f-971c-1a2d2f12d5f1",
        name: "notEqual",
        "display-name": "Not equal to",
        type: "dimension",
        dimension: ["field", PRODUCTS.RATING, null],
        "widget-type": "number/!=",
        default: null,
      },
      between: {
        id: "6a3d9a46-671b-dee3-2971-fc180d27adfd",
        name: "between",
        "display-name": "Between",
        type: "dimension",
        dimension: ["field", PRODUCTS.RATING, null],
        "widget-type": "number/between",
        default: null,
      },
      gteq: {
        id: "edd13ea2-e244-69f8-db5a-2a7f9722f269",
        name: "gteq",
        "display-name": "Greater than or equal to",
        type: "dimension",
        dimension: ["field", PRODUCTS.RATING, null],
        "widget-type": "number/>=",
        default: null,
      },
      lteq: {
        id: "cce8c724-f0df-6fa1-81dc-58e7a8171caa",
        name: "lteq",
        "display-name": "Less than or equal to",
        type: "dimension",
        dimension: ["field", PRODUCTS.RATING, null],
        "widget-type": "number/<=",
        default: null,
      },
    },
  },
};
