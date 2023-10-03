import { createMockMetadata } from "__support__/metadata";
import {
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import {
  createMockField,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import type Field from "./metadata/Field";
import * as Lib from "./v2";

const BOOLEAN_FIELD_ID = 999;
const _peopleTable = createPeopleTable();

_peopleTable.fields?.push(
  createMockField({
    id: BOOLEAN_FIELD_ID,
    table_id: PEOPLE_ID,
    name: "IS_ACTIVE",
    display_name: "Is Active",
    base_type: "type/Boolean",
    effective_type: "type/Boolean",
    semantic_type: "type/Category",
    has_field_values: "list",
    fingerprint: { global: { "distinct-count": 2, "nil%": 0 } },
  }),
);

const metadata = createMockMetadata({
  databases: [
    createSampleDatabase({
      tables: [
        createOrdersTable(),
        createProductsTable(),
        _peopleTable,
        createReviewsTable(),
      ],
    }),
  ],
});

const pk = (metadata.field(ORDERS.ID) as Field).reference();
const fk = (metadata.field(ORDERS.USER_ID) as Field).reference();
const tax = (metadata.field(ORDERS.TAX) as Field).reference();
const createdAt = (metadata.field(ORDERS.CREATED_AT) as Field).reference();
const name = (metadata.field(PEOPLE.NAME) as Field).reference();
const isActive = (metadata.field(BOOLEAN_FIELD_ID) as Field).reference();

function createdAtWithUnit(temporalUnit: string) {
  return ["field", ORDERS.CREATED_AT, { "temporal-unit": temporalUnit }];
}

const PK_FILTERS = [
  { clause: ["=", pk, 1], name: "ID is 1" },
  { clause: ["=", pk, 4], name: "ID is 4" },
  { clause: ["=", pk, 1, 2], name: "ID is 2 selections" },
  { clause: ["=", pk, 1, 2, 3], name: "ID is 3 selections" },
  { clause: ["!=", pk, 4], name: "ID is not 4" },
  { clause: ["!=", pk, 1, 2], name: "ID is not 2 selections" },
  { clause: ["!=", pk, 2, 3, 5], name: "ID is not 3 selections" },
  { clause: [">", pk, 1], name: "ID is greater than 1" },
  { clause: ["<", pk, 1], name: "ID is less than 1" },
  { clause: ["between", pk, 1, 10], name: "ID between 1 10" },
  { clause: [">=", pk, 1], name: "ID is greater than or equal to 1" },
  { clause: ["<=", pk, 1], name: "ID is less than or equal to 1" },
  { clause: ["is-null", pk], name: "ID is empty" },
  { clause: ["not-null", pk], name: "ID is not empty" },
];

const FK_FILTERS = [
  { clause: ["=", fk, 1], name: "User ID is 1" },
  { clause: ["=", fk, 11], name: "User ID is 11" },
  { clause: ["=", fk, 1, 2], name: "User ID is 2 selections" },
  { clause: ["=", fk, 1, 2, 12], name: "User ID is 3 selections" },
  { clause: ["!=", fk, 1], name: "User ID is not 1" },
  { clause: ["!=", fk, 1, 2], name: "User ID is not 2 selections" },
  { clause: ["!=", fk, 1, 2, 12], name: "User ID is not 3 selections" },
  { clause: [">", fk, 1], name: "User ID is greater than 1" },
  { clause: ["<", fk, 1], name: "User ID is less than 1" },
  { clause: ["between", fk, 1, 10], name: "User ID between 1 10" },
  { clause: [">=", fk, 1], name: "User ID is greater than or equal to 1" },
  { clause: ["<=", fk, 1], name: "User ID is less than or equal to 1" },
  { clause: ["is-null", fk], name: "User ID is empty" },
  { clause: ["not-null", fk], name: "User ID is not empty" },
];

const NUMBER_FILTERS = [
  { clause: ["=", tax, 1], name: "Tax is equal to 1" },
  { clause: ["=", tax, 7], name: "Tax is equal to 7" },
  { clause: ["=", tax, 7, 10], name: "Tax is equal to 2 selections" },
  { clause: ["=", tax, 7, 10, 71], name: "Tax is equal to 3 selections" },
  { clause: ["!=", tax, 1], name: "Tax is not equal to 1" },
  { clause: ["!=", tax, 7], name: "Tax is not equal to 7" },
  { clause: ["!=", tax, 7, 10], name: "Tax is not equal to 2 selections" },
  { clause: ["!=", tax, 7, 10, 71], name: "Tax is not equal to 3 selections" },
  { clause: [">", tax, 7], name: "Tax is greater than 7" },
  { clause: ["<", tax, 7], name: "Tax is less than 7" },
  { clause: ["between", tax, 7, 10], name: "Tax between 7 10" },
  { clause: [">=", tax, 1], name: "Tax is greater than or equal to 1" },
  { clause: ["<=", tax, 1], name: "Tax is less than or equal to 1" },
  { clause: ["is-null", tax], name: "Tax is empty" },
  { clause: ["not-null", tax], name: "Tax is not empty" },
];

const STRING_FILTERS = [
  { clause: ["=", name, "ABC"], name: "Name is ABC" },
  { clause: ["=", name, "A", "B"], name: "Name is 2 selections" },
  { clause: ["=", name, "A", "B", "C"], name: "Name is 3 selections" },
  { clause: ["!=", name, "ABC"], name: "Name is not ABC" },
  { clause: ["!=", name, "A", "B"], name: "Name is not 2 selections" },
  { clause: ["!=", name, "A", "B", "C"], name: "Name is not 3 selections" },
  { clause: ["contains", name, "ABC"], name: "Name contains ABC" },
  {
    clause: ["contains", name, "ABC", { "case-sensitive": true }],
    name: "Name contains ABC",
  },
  {
    clause: ["does-not-contain", name, "ABC"],
    name: "Name does not contain ABC",
  },
  { clause: ["is-empty", name], name: "Name is empty" },
  { clause: ["not-empty", name], name: "Name is not empty" },
  {
    clause: ["does-not-contain", name, "ABC"],
    name: "Name does not contain ABC",
  },
  { clause: ["starts-with", name, "ABC"], name: "Name starts with ABC" },
  { clause: ["ends-with", name, "ABC"], name: "Name ends with ABC" },
];

const BOOLEAN_FILTERS = [
  { clause: ["=", isActive, true], name: "Is Active is true" },
  { clause: ["=", isActive, false], name: "Is Active is false" },
  { clause: ["is-null", isActive], name: "Is Active is empty" },
  { clause: ["not-null", isActive], name: "Is Active is not empty" },
];

const SPECIFIC_DATE_FILTERS = [
  {
    clause: ["=", createdAt, "2023-10-03"],
    name: "Created At is October 3, 2023",
  },
  {
    clause: ["=", createdAt, "2023-10-03T12:30:00"],
    name: "Created At is October 3, 2023, 12:30 PM",
  },
  {
    clause: [">", createdAt, "2023-10-03"],
    name: "Created At is after October 3, 2023",
  },
  {
    clause: [">", createdAt, "2023-10-03T12:30:00"],
    name: "Created At is after October 3, 2023, 12:30 PM",
  },
  {
    clause: ["<", createdAt, "2023-10-03"],
    name: "Created At is before October 3, 2023",
  },
  {
    clause: ["<", createdAt, "2023-10-03T12:30:00"],
    name: "Created At is before October 3, 2023, 12:30 PM",
  },

  // Same month
  {
    clause: ["between", createdAt, "2023-10-03", "2023-10-05"],
    name: "Created At is October 3-5, 2023",
  },
  {
    clause: [
      "between",
      createdAt,
      "2023-10-03T13:00:00",
      "2023-10-05T01:00:00",
    ],
    name: "Created At is October 3, 1:00 PM – October 5, 2023, 1:00 AM",
  },

  // Different months
  {
    clause: ["between", createdAt, "2023-09-03", "2023-10-03"],
    name: "Created At is September 3 – October 3, 2023",
  },
  {
    clause: [
      "between",
      createdAt,
      "2023-09-03T13:00:00",
      "2023-10-03T13:00:00",
    ],
    name: "Created At is September 3, 1:00 PM – October 3, 2023, 1:00 PM",
  },

  // Same month, different years
  {
    clause: ["between", createdAt, "2022-10-01", "2023-10-03"],
    name: "Created At is October 1, 2022 – October 3, 2023",
  },
  {
    clause: [
      "between",
      createdAt,
      "2022-10-01T13:00:00",
      "2023-10-03T01:00:00",
    ],
    name: "Created At is October 1, 2022, 1:00 PM – October 3, 2023, 1:00 AM",
  },

  // Different months, different years
  {
    clause: ["between", createdAt, "2022-09-01", "2023-10-03"],
    name: "Created At is September 1, 2022 – October 3, 2023",
  },
  {
    clause: [
      "between",
      createdAt,
      "2022-09-01T13:00:00",
      "2023-10-03T01:00:00",
    ],
    name: "Created At is September 1, 2022, 1:00 PM – October 3, 2023, 1:00 AM",
  },
];

const EXCLUDE_DATE_FILTERS = [
  // Day of week
  {
    clause: ["!=", createdAtWithUnit("day-of-week"), "2023-10-02"],
    name: "Created At excludes Monday",
  },
  {
    clause: [
      "!=",
      createdAtWithUnit("day-of-week"),
      "2023-10-02",
      "2023-10-03",
      "2023-10-04",
    ],
    name: "Created At excludes 3 selections",
  },

  // Month
  {
    clause: ["!=", createdAtWithUnit("month-of-year"), "2023-01-01"],
    name: "Created At excludes January",
  },
  {
    clause: [
      "!=",
      createdAtWithUnit("month-of-year"),
      "2023-01-01",
      "2023-02-01",
      "2023-03-01",
    ],
    name: "Created At excludes 3 selections",
  },

  // Quarter
  {
    clause: ["!=", createdAtWithUnit("quarter-of-year"), "2023-01-03"],
    name: "Created At excludes Q1",
  },
  {
    clause: [
      "!=",
      createdAtWithUnit("quarter-of-year"),
      "2023-01-03",
      "2023-04-03",
      "2023-07-03",
    ],
    name: "Created At excludes 3 selections",
  },

  // Hour of day
  {
    clause: ["!=", createdAtWithUnit("hour-of-day"), 0],
    name: "Created At excludes 12 AM",
  },
  {
    clause: ["!=", createdAtWithUnit("hour-of-day"), 4],
    name: "Created At excludes 4 AM",
  },
  {
    clause: ["!=", createdAtWithUnit("hour-of-day"), 12],
    name: "Created At excludes 12 PM",
  },
  {
    clause: ["!=", createdAtWithUnit("hour-of-day"), 16],
    name: "Created At excludes 4 PM",
  },
  {
    clause: ["!=", createdAtWithUnit("hour-of-day"), 0, 1, 2],
    name: "Created At excludes 3 selections",
  },

  // Empty / not-empty
  { clause: ["is-null", createdAt], name: "Created At is empty" },
  { clause: ["not-null", createdAt], name: "Created At is not empty" },
];

const RELATIVE_DATE_FILTERS = [
  // Past
  {
    clause: ["time-interval", createdAt, -1, "minute"],
    name: "Created At Previous Minute",
  },
  {
    clause: ["time-interval", createdAt, -3, "minute"],
    name: "Created At Previous 3 Minutes",
  },

  {
    clause: ["time-interval", createdAt, -1, "hour"],
    name: "Created At Previous Hour",
  },
  {
    clause: ["time-interval", createdAt, -3, "hour"],
    name: "Created At Previous Hours",
  },

  {
    clause: ["time-interval", createdAt, -1, "day"],
    name: "Created At Previous Day",
  },
  {
    clause: ["time-interval", createdAt, -3, "day"],
    name: "Created At Previous 3 Days",
  },

  {
    clause: ["time-interval", createdAt, -1, "week"],
    name: "Created At Previous Week",
  },
  {
    clause: ["time-interval", createdAt, -3, "week"],
    name: "Created At Previous 3 Weeks",
  },

  {
    clause: ["time-interval", createdAt, -1, "month"],
    name: "Created At Previous Month",
  },
  {
    clause: ["time-interval", createdAt, -3, "month"],
    name: "Created At Previous 3 Months",
  },

  {
    clause: ["time-interval", createdAt, -1, "quarter"],
    name: "Created At Previous Quarter",
  },
  {
    clause: ["time-interval", createdAt, -3, "quarter"],
    name: "Created At Previous 3 Quarters",
  },

  {
    clause: ["time-interval", createdAt, -1, "year"],
    name: "Created At Previous Year",
  },
  {
    clause: ["time-interval", createdAt, -3, "year"],
    name: "Created At Previous 3 Years",
  },

  {
    clause: [
      "between",
      ["+", createdAt, ["interval", 1, "month"]],
      ["relative-datetime", -1, "month"],
      ["relative-datetime", 0, "month"],
    ],
    name: "Created At Previous Month, starting 1 months ago",
  },

  // Current
  {
    clause: ["time-interval", createdAt, "current", "day"],
    name: "Created At Today",
  },
  {
    clause: ["time-interval", createdAt, "current", "week"],
    name: "Created At This Week",
  },
  {
    clause: ["time-interval", createdAt, "current", "month"],
    name: "Created At This Month",
  },
  {
    clause: ["time-interval", createdAt, "current", "quarter"],
    name: "Created At This Quarter",
  },
  {
    clause: ["time-interval", createdAt, "current", "year"],
    name: "Created At This Year",
  },

  // Next
  {
    clause: ["time-interval", createdAt, 1, "minute"],
    name: "Created At Next Minute",
  },
  {
    clause: ["time-interval", createdAt, 3, "minute"],
    name: "Created At Next 3 Minutes",
  },

  {
    clause: ["time-interval", createdAt, 1, "hour"],
    name: "Created At Next Hour",
  },
  {
    clause: ["time-interval", createdAt, 3, "hour"],
    name: "Created At Next Hours",
  },

  {
    clause: ["time-interval", createdAt, 1, "day"],
    name: "Created At Next Day",
  },
  {
    clause: ["time-interval", createdAt, 3, "day"],
    name: "Created At Next 3 Days",
  },

  {
    clause: ["time-interval", createdAt, 1, "week"],
    name: "Created At Next Week",
  },
  {
    clause: ["time-interval", createdAt, 3, "week"],
    name: "Created At Next 3 Weeks",
  },

  {
    clause: ["time-interval", createdAt, 1, "month"],
    name: "Created At Next Month",
  },
  {
    clause: ["time-interval", createdAt, 3, "month"],
    name: "Created At Next 3 Months",
  },

  {
    clause: ["time-interval", createdAt, 1, "quarter"],
    name: "Created At Next Quarter",
  },
  {
    clause: ["time-interval", createdAt, 3, "quarter"],
    name: "Created At Next 3 Quarters",
  },

  {
    clause: ["time-interval", createdAt, 1, "year"],
    name: "Created At Next Year",
  },
  {
    clause: ["time-interval", createdAt, 3, "year"],
    name: "Created At Next 3 Years",
  },

  {
    clause: [
      "between",
      ["+", createdAt, ["interval", -1, "month"]],
      ["relative-datetime", 0, "month"],
      ["relative-datetime", 1, "month"],
    ],
    name: "Created At Next Month, starting 1 months from now",
  },
];

function getFilterName(filter: any, tableId = ORDERS_ID) {
  const legacyQuery = createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": tableId,
      filters: [filter],
    },
  });
  const query = Lib.fromLegacyQuery(SAMPLE_DB_ID, metadata, legacyQuery);
  const [filterClause] = Lib.filters(query, 0);
  return Lib.displayInfo(query, 0, filterClause).displayName;
}

describe("PK filters", () => {
  PK_FILTERS.forEach(({ clause, name }) => {
    test(`${name}`, () => {
      expect(getFilterName(clause)).toEqual(name);
    });
  });
});

describe("FK filters", () => {
  FK_FILTERS.forEach(({ clause, name }) => {
    test(`${name}`, () => {
      expect(getFilterName(clause)).toEqual(name);
    });
  });
});

describe("Number filters", () => {
  NUMBER_FILTERS.forEach(({ clause, name }) => {
    test(`${name}`, () => {
      expect(getFilterName(clause)).toEqual(name);
    });
  });
});

describe("String filters", () => {
  STRING_FILTERS.forEach(({ clause, name }) => {
    test(`${name}`, () => {
      expect(getFilterName(clause, PEOPLE_ID)).toEqual(name);
    });
  });
});

describe("Boolean filters", () => {
  BOOLEAN_FILTERS.forEach(({ clause, name }) => {
    test(`${name}`, () => {
      expect(getFilterName(clause, PEOPLE_ID)).toEqual(name);
    });
  });
});

describe("Date filters", () => {
  describe("Specific date filters", () => {
    SPECIFIC_DATE_FILTERS.forEach(({ clause, name }) => {
      test(`${name}`, () => {
        expect(getFilterName(clause)).toEqual(name);
      });
    });
  });

  describe("Exclude date filters", () => {
    EXCLUDE_DATE_FILTERS.forEach(({ clause, name }) => {
      test(`${name}`, () => {
        expect(getFilterName(clause)).toEqual(name);
      });
    });
  });

  describe("Relative date filters", () => {
    RELATIVE_DATE_FILTERS.forEach(({ clause, name }) => {
      test(`${name}`, () => {
        expect(getFilterName(clause)).toEqual(name);
      });
    });
  });
});
