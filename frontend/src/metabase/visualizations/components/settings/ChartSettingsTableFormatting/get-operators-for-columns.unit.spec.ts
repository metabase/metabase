import { createMockColumn } from "metabase-types/api/mocks";

import { getOperatorsForColumns } from "./get-operators-for-columns";

const STRING_COLUMN = createMockColumn({
  base_type: "type/Text",
  display_name: "String Column",
  name: "STRING_COLUMN",
});

const STRING_COLUMN_TWO = createMockColumn({
  base_type: "type/Text",
  display_name: "String Column 2",
  name: "STRING_COLUMN_2",
});

const BOOLEAN_COLUMN = createMockColumn({
  base_type: "type/Boolean",
  display_name: "Boolean Column",
  name: "BOOLEAN_COLUMN",
});

const NUMBER_COLUMN = createMockColumn({
  base_type: "type/Integer",
  display_name: "Number Column",
  name: "NUMBER_COLUMN",
});

const PRIMARY_KEY_COLUMN = createMockColumn({
  base_type: "type/Integer",
  semantic_type: "type/PK",
  display_name: "Primary Key Column",
  name: "PK_COLUMN",
});

const FOREIGN_KEY_COLUMN = createMockColumn({
  base_type: "type/Integer",
  semantic_type: "type/FK",
  display_name: "Foreign Key Column",
  name: "FK_COLUMN",
});

describe("getOperatorsForColumns", () => {
  it("should return default result if columns is empty", () => {
    expect(getOperatorsForColumns([])).toEqual({
      isStringRule: false,
      isNumericRule: false,
      isBooleanRule: false,
      isKeyRule: false,
      operators: {},
      isFieldDisabled: expect.any(Function),
    });
  });

  it("should work with a boolean selection", () => {
    const result = getOperatorsForColumns([BOOLEAN_COLUMN, BOOLEAN_COLUMN]);

    expect(result).toEqual({
      isStringRule: false,
      isNumericRule: false,
      isBooleanRule: true,
      isKeyRule: false,
      operators: {
        "is-false": "is false",
        "is-null": "is null",
        "is-true": "is true",
        "not-null": "is not null",
      },
      isFieldDisabled: expect.any(Function),
    });

    expect(result.isFieldDisabled(BOOLEAN_COLUMN)).toBe(false);
    expect(result.isFieldDisabled(PRIMARY_KEY_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(FOREIGN_KEY_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(NUMBER_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(STRING_COLUMN)).toBe(true);
  });

  it("should work with a string selection", () => {
    const result = getOperatorsForColumns([STRING_COLUMN, STRING_COLUMN_TWO]);

    expect(result).toEqual({
      isStringRule: true,
      isNumericRule: false,
      isBooleanRule: false,
      isKeyRule: false,
      operators: {
        "=": "is equal to",
        "!=": "is not equal to",
        contains: "contains",
        "does-not-contain": "does not contain",
        "ends-with": "ends with",
        "is-null": "is null",
        "not-null": "is not null",
        "starts-with": "starts with",
      },
      isFieldDisabled: expect.any(Function),
    });

    expect(result.isFieldDisabled(BOOLEAN_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(PRIMARY_KEY_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(FOREIGN_KEY_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(NUMBER_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(STRING_COLUMN)).toBe(false);
  });

  it("should work with a number selection", () => {
    const result = getOperatorsForColumns([NUMBER_COLUMN]);

    expect(result).toEqual({
      isStringRule: false,
      isNumericRule: true,
      isBooleanRule: false,
      isKeyRule: false,
      operators: {
        "=": "is equal to",
        "!=": "is not equal to",
        "<": "is less than",
        "<=": "is less than or equal to",
        ">": "is greater than",
        ">=": "is greater than or equal to",
        "is-null": "is null",
        "not-null": "is not null",
      },
      isFieldDisabled: expect.any(Function),
    });

    expect(result.isFieldDisabled(BOOLEAN_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(PRIMARY_KEY_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(FOREIGN_KEY_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(NUMBER_COLUMN)).toBe(false);
    expect(result.isFieldDisabled(STRING_COLUMN)).toBe(true);
  });

  it("should work with a primary key selection", () => {
    const result = getOperatorsForColumns([PRIMARY_KEY_COLUMN]);

    expect(result).toEqual({
      isStringRule: true,
      isNumericRule: false,
      isBooleanRule: false,
      isKeyRule: true,
      operators: {
        "=": "is equal to",
        "!=": "is not equal to",
        contains: "contains",
        "does-not-contain": "does not contain",
        "ends-with": "ends with",
        "is-null": "is null",
        "not-null": "is not null",
        "starts-with": "starts with",
      },
      isFieldDisabled: expect.any(Function),
    });

    expect(result.isFieldDisabled(BOOLEAN_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(PRIMARY_KEY_COLUMN)).toBe(false);
    expect(result.isFieldDisabled(FOREIGN_KEY_COLUMN)).toBe(false);
    expect(result.isFieldDisabled(NUMBER_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(STRING_COLUMN)).toBe(true);
  });

  it("should work with a foreign key selection", () => {
    const result = getOperatorsForColumns([FOREIGN_KEY_COLUMN]);

    expect(result).toEqual({
      isStringRule: true,
      isNumericRule: false,
      isBooleanRule: false,
      isKeyRule: true,
      operators: {
        "=": "is equal to",
        "!=": "is not equal to",
        contains: "contains",
        "does-not-contain": "does not contain",
        "ends-with": "ends with",
        "is-null": "is null",
        "not-null": "is not null",
        "starts-with": "starts with",
      },
      isFieldDisabled: expect.any(Function),
    });

    expect(result.isFieldDisabled(BOOLEAN_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(PRIMARY_KEY_COLUMN)).toBe(false);
    expect(result.isFieldDisabled(FOREIGN_KEY_COLUMN)).toBe(false);
    expect(result.isFieldDisabled(NUMBER_COLUMN)).toBe(true);
    expect(result.isFieldDisabled(STRING_COLUMN)).toBe(true);
  });
});
