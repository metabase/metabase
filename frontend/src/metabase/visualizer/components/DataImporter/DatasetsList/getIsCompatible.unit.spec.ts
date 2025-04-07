import {
  DateTimeColumn,
  NumberColumn,
  StringColumn,
} from "__support__/visualizations";
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

  it("should only match scalars with scalars (assuming the same primary column can be found in both)", () => {
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
    ).toBe(true);

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
});
