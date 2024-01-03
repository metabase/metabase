import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PEOPLE } = SAMPLE_DATABASE;

export const DASHBOARD_SQL_DATE_FILTERS = {
  "Month and Year": {
    sqlFilter: "date/month-year",
    value: {
      month: "September",
      year: "2022",
    },
    representativeResult: "Rene Muller",
  },
  "Quarter and Year": {
    sqlFilter: "date/quarter-year",
    value: {
      quarter: "Q2",
      year: "2022",
    },
    representativeResult: "Khalid Pouros",
  },
  "Single Date": {
    sqlFilter: "date/single",
    value: "05/24/2022",
    representativeResult: "Delphia Price",
  },
  "Date Range": {
    sqlFilter: "date/range",
    value: {
      startDate: "05/25/2022",
      endDate: "06/01/2022",
    },
    representativeResult: "Trisha Hoeger",
  },
  "All Options": {
    sqlFilter: "date/all-options",
    value: {
      timeBucket: "years",
    },
    representativeResult: "Lina Heaney", // this may change every year
  },
};

export const questionDetails = {
  name: "SQL with Field Filters",
  native: {
    query:
      "  select PEOPLE.NAME, PEOPLE.CREATED_AT from people where true\n  [[AND {{monthyear}}]]\n  [[AND {{quarteryear}}]]\n  [[AND {{single}}]]\n  [[AND {{range}}]]\n  [[AND {{relative}}]]\n  [[AND {{date}}]]\n  limit 10",
    "template-tags": {
      monthyear: {
        default: null,
        dimension: ["field", PEOPLE.CREATED_AT, null],
        "display-name": "Month and Year",
        id: "5e40619a-34ff-426d-a5b8-251defe355e5",
        name: "monthyear",
        type: "dimension",
        "widget-type": "date/month-year",
      },
      quarteryear: {
        default: null,
        dimension: ["field", PEOPLE.CREATED_AT, null],
        "display-name": "Quarter and Year",
        id: "1f4ddbaf-e071-7be3-ce5d-fdc5b4f62ab9",
        name: "quarteryear",
        type: "dimension",
        "widget-type": "date/quarter-year",
      },
      single: {
        default: null,
        dimension: ["field", PEOPLE.CREATED_AT, null],
        "display-name": "Single Date",
        id: "726fd574-ed18-5b06-4d9d-4f901ef3378a",
        name: "single",
        type: "dimension",
        "widget-type": "date/single",
      },
      range: {
        default: null,
        dimension: ["field", PEOPLE.CREATED_AT, null],
        "display-name": "Date Range",
        id: "f4ed832a-8882-d25a-1517-95a7ac478660",
        name: "range",
        type: "dimension",
        "widget-type": "date/range",
      },
      relative: {
        default: null,
        dimension: ["field", PEOPLE.CREATED_AT, null],
        "display-name": "Relative Date",
        id: "4a6c70c8-8b39-7058-5b4e-7a7ede920fca",
        name: "relative",
        type: "dimension",
        "widget-type": "date/relative",
      },

      date: {
        default: null,
        dimension: ["field", PEOPLE.CREATED_AT, null],
        "display-name": "All Options",
        id: "04171d50-5901-edaf-fba1-9b14211e965e",
        name: "date",
        type: "dimension",
        "widget-type": "date/all-options",
      },
    },
  },
};
