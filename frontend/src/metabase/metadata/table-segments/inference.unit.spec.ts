import { createMockField } from "metabase-types/api/mocks";

import { inferDefaultSegment, inferSystemSegment } from "./inference";

const ID = createMockField({
  id: 1,
  name: "worker_id",
  base_type: "type/Text",
});
const END_DATE = createMockField({
  id: 2,
  name: "end_date",
  base_type: "type/Date",
});
const IS_CURRENT = createMockField({
  id: 3,
  name: "is_current",
  base_type: "type/Boolean",
});
const STILL_HERE = createMockField({
  id: 4,
  name: "still_here",
  base_type: "type/Boolean",
});

const FIELDS = [ID, END_DATE, IS_CURRENT, STILL_HERE];

describe("inferSystemSegment", () => {
  it("finds current rows by column name without a history binding", () => {
    expect(inferSystemSegment(FIELDS, "current_rows").conditions).toEqual([
      { fieldId: 3, operator: "=", value: true },
    ]);
  });

  it("uses the history binding's current flag over column names", () => {
    expect(
      inferSystemSegment(FIELDS, "current_rows", {
        currentFlagFieldId: 4,
        validToFieldId: 2,
      }).conditions,
    ).toEqual([{ fieldId: 4, operator: "=", value: true }]);
  });

  it("uses an empty valid to when the history binding has no current flag", () => {
    expect(
      inferSystemSegment(FIELDS, "current_rows", {
        currentFlagFieldId: null,
        validToFieldId: 2,
      }).conditions,
    ).toEqual([{ fieldId: 2, operator: "is-null" }]);
  });

  it("builds no current rows segment when the latest row per key is current", () => {
    const inference = inferSystemSegment(FIELDS, "current_rows", {
      currentFlagFieldId: null,
      validToFieldId: null,
    });

    expect(inference.conditions).toEqual([]);
    expect(inference.signal).toMatch(/latest row per key/);
  });
});

describe("inferDefaultSegment", () => {
  it("defaults a history table to its current rows", () => {
    expect(
      inferDefaultSegment([ID, END_DATE], {
        currentFlagFieldId: null,
        validToFieldId: 2,
      }).segment,
    ).toEqual({ type: "system", role: "current_rows" });
  });

  it("doesn't default to current rows when the latest row per key is current", () => {
    const inference = inferDefaultSegment([ID, END_DATE], {
      currentFlagFieldId: null,
      validToFieldId: null,
    });

    expect(inference.segment).toEqual({ type: "all" });
    expect(inference.signal).toMatch(/latest row per key/);
  });
});
