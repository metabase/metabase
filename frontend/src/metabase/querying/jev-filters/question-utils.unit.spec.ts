import type { JevFilterSuggestion } from "metabase/api/jev-filters";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { ParameterValueOrArray } from "metabase-types/api";

import {
  type JevQuestionColumnsByKey,
  applyJevFilters,
  getJevQuestionColumns,
} from "./question-utils";

function setup() {
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
  const columnsByKey = getJevQuestionColumns(query);
  return { query, columnsByKey };
}

function findKey(columnsByKey: JevQuestionColumnsByKey, displayName: string) {
  const entry = Array.from(columnsByKey.values()).find(
    ({ info }) => info.display_name === displayName,
  );
  if (!entry) {
    throw new Error(`No column ${displayName}`);
  }
  return entry.info.key;
}

function applyOne(
  displayName: string,
  parameterType: string,
  value: ParameterValueOrArray,
) {
  const { query, columnsByKey } = setup();
  const suggestion: JevFilterSuggestion = {
    parameter_id: findKey(columnsByKey, displayName),
    parameter_name: displayName,
    parameter_type: parameterType,
    value,
    label: String(value),
    confidence: 0.9,
  };
  const newQuery = applyJevFilters(query, columnsByKey, [
    { suggestion, value, label: suggestion.label, parameterType },
  ]);
  return Lib.filters(newQuery, -1).map(
    (filter) => Lib.displayInfo(newQuery, -1, filter).displayName,
  );
}

describe("getJevQuestionColumns", () => {
  it("describes filterable columns with a kind, skipping keys", () => {
    const { columnsByKey } = setup();
    const columns = Array.from(columnsByKey.values(), ({ info }) => info);

    expect(columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ display_name: "Created At", kind: "date" }),
        expect.objectContaining({ display_name: "Total", kind: "number" }),
        expect.objectContaining({
          display_name: "Product → Category",
          kind: "values",
          field_id: expect.any(Number),
        }),
      ]),
    );
    expect(columns.map((column) => column.display_name)).not.toContain("ID");
    expect(columns.map((column) => column.display_name)).not.toContain(
      "Product ID",
    );
  });
});

describe("applyJevFilters", () => {
  it.each<[string, string, ParameterValueOrArray, string]>([
    ["Total", "number/=", [100], "Total is equal to 100"],
    ["Total", "number/>=", [100], "Total is greater than or equal to 100"],
    ["Total", "number/<=", [100], "Total is less than or equal to 100"],
    ["Total", "number/between", [10, 20], "Total is between 10 and 20"],
    [
      "Total",
      "number/between",
      [10, null],
      "Total is greater than or equal to 10",
    ],
    ["Product → Category", "string/=", ["Gizmo"], "Category is Gizmo"],
    [
      "Product → Category",
      "string/=",
      ["Gizmo", "Widget"],
      "Category is 2 selections",
    ],
  ])("filters %s with %s %j", (column, type, value, expected) => {
    expect(applyOne(column, type, value)).toEqual([expected]);
  });

  it("builds date filters from serialized parameter values", () => {
    expect(applyOne("Created At", "date/all-options", "past1quarters")).toEqual(
      ["Created At is in the previous quarter"],
    );
  });

  it.each([
    "today",
    "yesterday",
    "thisweek",
    "thisquarter",
    "past30days",
    "past1quarters",
    "past12months",
    "next1quarters",
    "2025-01-01~2025-12-31",
    "Q1-2025",
    "2025-04",
    "2026-03-01~",
    "~2026-03-01",
    "2026-03-01",
  ])("turns the backend's date option %s into exactly one filter", (value) => {
    expect(applyOne("Created At", "date/all-options", value)).toHaveLength(1);
  });

  it("skips values it can't turn into a filter", () => {
    expect(applyOne("Created At", "date/all-options", "not a date")).toEqual(
      [],
    );
  });
});
