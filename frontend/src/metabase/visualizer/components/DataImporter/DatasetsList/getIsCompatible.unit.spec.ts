import {
  DateTimeColumn,
  NumberColumn,
  StringColumn,
} from "__support__/visualizations";
import { TYPE } from "cljs/metabase.types.core";
import type { Field } from "metabase-types/api";
import { createMockColumn, createMockField } from "metabase-types/api/mocks";

import { getIsCompatible } from "./getIsCompatible";

describe("getIsCompatible", () => {
  it("should return false for pie display", () => {
    const result = getIsCompatible({
      currentDataset: { display: "pie" },
      targetDataset: {},
    });
    expect(result).toBe(false);
  });

  it("should return false if there is not primary column", () => {
    const result = getIsCompatible({
      currentDataset: { display: "scalar" },
      targetDataset: {},
    });
    expect(result).toBe(false);
  });

  it("should not match scalars with anything", () => {
    const primaryColumn = createMockColumn(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const field = createMockField(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const fieldButWithDifferentName = createMockField(
      NumberColumn({
        id: 1,
        name: "same field but no",
      }),
    );

    const anotherField = createMockField(
      StringColumn({
        id: 2,
        name: "another column",
      }),
    );

    expect(
      getIsCompatible({
        currentDataset: { display: "scalar", primaryColumn },
        targetDataset: { display: "scalar", fields: [field] },
      }),
    ).toBe(false);

    expect(
      getIsCompatible({
        currentDataset: { display: "scalar", primaryColumn },
        targetDataset: { display: "scalar", fields: [anotherField] },
      }),
    ).toBe(false);

    expect(
      getIsCompatible({
        currentDataset: { display: "scalar", primaryColumn },
        targetDataset: {
          display: "scalar",
          fields: [fieldButWithDifferentName],
        },
      }),
    ).toBe(false);
  });

  it("should never accept a target that only has one field (if it's not a scalar)", () => {
    const primaryColumn = createMockColumn(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const field = createMockField(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const anotherField = createMockField(
      StringColumn({
        id: 2,
        name: "another column",
      }),
    );

    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: { display: "pie", fields: [field] },
      }),
    ).toBe(false);

    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: { display: "pie", fields: [anotherField] },
      }),
    ).toBe(false);
  });

  it("should accept a target that only has one field if we are building a funnel", () => {
    const primaryColumn = createMockColumn(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const field = createMockField(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    expect(
      getIsCompatible({
        currentDataset: { display: "funnel", primaryColumn },
        targetDataset: { display: "scalar", fields: [field] },
      }),
    ).toBe(true);
    expect(
      getIsCompatible({
        currentDataset: { display: "funnel", primaryColumn },
        targetDataset: { display: "funnel", fields: [] },
      }),
    ).toBe(false);
  });

  it("should accept a target if the primary column is a string or number (assuming the target has the same column)", () => {
    const primaryColumn = createMockColumn(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const field = createMockField(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const anotherField = createMockField(
      DateTimeColumn({
        id: 2,
        name: "another column",
      }),
    );

    const andAnotherField = createMockField(
      StringColumn({
        id: 3,
        name: "and another column",
      }),
    );

    // No type match (primary is number, and target is DateTime or string)
    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: {
          display: "line",
          fields: [anotherField, andAnotherField],
        },
      }),
    ).toBe(false);

    // same type found (field is Number)
    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: { display: "line", fields: [field, anotherField] },
      }),
    ).toBe(true);
  });

  it("should accept a target with a field with the same type as the primary column", () => {
    const primaryColumn = createMockColumn(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const field = createMockField(
      NumberColumn({
        id: 1,
        name: "the column",
      }),
    );

    const anotherField = createMockField(
      StringColumn({
        id: 2,
        name: "another column",
      }),
    );

    const andAnotherField = createMockField(
      StringColumn({
        id: 3,
        name: "and another column",
      }),
    );

    const anotherFieldWithSameType = createMockField(
      NumberColumn({
        id: 4,
        name: "and again a different column",
      }),
    );

    // same field found
    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: { display: "line", fields: [field, anotherField] },
      }),
    ).toBe(true);

    // no similar field found
    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: {
          display: "line",
          fields: [anotherField, andAnotherField],
        },
      }),
    ).toBe(false);

    // different field but same type found
    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: {
          display: "line",
          fields: [anotherFieldWithSameType, anotherField],
        },
      }),
    ).toBe(true);
  });

  it("should accept a target with an assignable type to the primary column, regardless of the semantic type (VIZ-638)", () => {
    const primaryColumn = createMockColumn(
      DateTimeColumn({
        id: 1,
        name: "the column",
        semantic_type: TYPE.Temporal, // <-- this needs to be set to something
      }),
    );

    const field = createMockField(
      StringColumn({
        id: 2,
        name: "the column",
      }),
    );

    // No semantic type here, it shouldn't matter
    const anotherField = createMockField(
      DateTimeColumn({
        id: 3,
        name: "another column",
      }),
    );

    expect(
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: { display: "line", fields: [field, anotherField] },
      }),
    ).toBe(true);
  });

  it("should only accept columns with same id and same type", () => {
    const primaryColumn = createMockColumn(
      NumberColumn({
        id: 1,
      }),
    );

    const dateField = createMockField(
      DateTimeColumn({
        id: 42,
        name: "create at",
      }),
    );

    const sameIdAndType = createMockField(
      NumberColumn({
        id: 1,
      }),
    );

    const differentIdAndType = createMockField(
      StringColumn({
        id: 2,
      }),
    );

    const differentIdSameType = createMockField(
      StringColumn({
        id: 3,
      }),
    );

    const allDifferent = createMockField(
      StringColumn({
        id: 4,
      }),
    );

    const isCompatible = (fields: Field[]) =>
      getIsCompatible({
        currentDataset: { display: "line", primaryColumn },
        targetDataset: { display: "line", fields },
      });

    expect(isCompatible([dateField, sameIdAndType])).toBe(true);
    expect(isCompatible([dateField, differentIdAndType])).toBe(false);
    expect(isCompatible([dateField, differentIdSameType])).toBe(false);
    expect(isCompatible([dateField, allDifferent])).toBe(false);
  });
});
