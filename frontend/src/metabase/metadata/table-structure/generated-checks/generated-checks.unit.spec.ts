import type { CustomPropertyChecksInput } from "./custom-property-checks";
import { getGeneratedChecks, getWorstFailingCheck } from "./generated-checks";
import type { HistoryChecksInput } from "./history-checks";
import { formatChecksYaml } from "./yaml";

const CUSTOM_PROPERTIES: CustomPropertyChecksInput = {
  table: { schema: "public", name: "custom_field_value" },
  columns: {
    entityKey: "customer_id",
    property: "custom_field_id",
    value: "value",
  },
  entity: {
    table: { schema: "public", name: "customers" },
    keyColumn: "id",
  },
  definitions: {
    table: { schema: "public", name: "custom_field" },
    keyColumn: "id",
    nameColumn: "name",
  },
  properties: [
    {
      key: "1",
      name: "plan",
      label: "Plan",
      type: "text",
      semanticType: "type/Category",
      knownValues: ["Enterprise", "Free", "Pro"],
      isMultiValued: false,
      looksLike: null,
    },
    {
      key: "5",
      name: "seats",
      label: "Seats",
      type: "integer",
      semanticType: "type/Quantity",
      knownValues: null,
      isMultiValued: false,
      looksLike: null,
    },
    {
      key: "9",
      name: "notes",
      label: "Notes",
      type: "text",
      semanticType: null,
      knownValues: null,
      isMultiValued: true,
      looksLike: null,
    },
    {
      key: "16",
      name: "plan_tier",
      label: "Plan tier",
      type: "text",
      semanticType: null,
      knownValues: null,
      isMultiValued: false,
      looksLike: "plan",
    },
  ],
};

const HISTORY: HistoryChecksInput = {
  table: { schema: "hr", name: "worker_position_history" },
  columns: {
    entityKey: "worker_id",
    validFrom: "valid_from",
    validTo: "valid_to",
    currentFlag: "is_current",
    version: "version_number",
  },
  isContiguous: true,
};

describe("getGeneratedChecks", () => {
  it("writes custom property checks in the data quality assertion language", () => {
    const checks = getGeneratedChecks({
      structure: { role: "role/CustomPropertyTable" },
      customProperties: CUSTOM_PROPERTIES,
    });

    expect(formatChecksYaml(checks)).toBe(`checks:
  - check: references
    table: public.custom_field_value
    column: customer_id
    to: public.customers.id
    name: "Every customer_id is in customers"

  - check: unique_combination
    table: public.custom_field_value
    columns: [customer_id, custom_field_id]
    name: "One value per customer_id and custom_field_id"
    where: "custom_field_id NOT IN (9)"

  - check: references
    table: public.custom_field_value
    column: custom_field_id
    to: public.custom_field.id
    name: "Every custom_field_id has a definition"

  - check: accepted_values
    table: public.custom_field_value
    column: value
    values: [Enterprise, Free, Pro]
    name: "Plan is one of its known values"
    where: "custom_field_id = 1"

  - check: valid_format
    table: public.custom_field_value
    column: value
    format: integer
    name: "Seats is a whole number"
    where: "custom_field_id = 5"

  - check: not_in_set
    table: public.custom_field
    column: name
    values: [plan_tier]
    name: "No property names that look like another"
    severity: warn
`);
  });

  it("returns no checks for a table that isn't a custom property table", () => {
    expect(
      getGeneratedChecks({
        structure: { role: "role/Dimension" },
        customProperties: CUSTOM_PROPERTIES,
      }),
    ).toEqual([]);
  });

  it("checks the property column for look-alikes when there are no definitions", () => {
    const checks = getGeneratedChecks({
      structure: { role: "role/CustomPropertyTable" },
      customProperties: { ...CUSTOM_PROPERTIES, definitions: null },
    });

    expect(checks.map(({ id }) => id)).not.toContain("definition");
    expect(checks.find(({ id }) => id === "look-alike")).toMatchObject({
      table: { schema: "public", name: "custom_field_value" },
      params: { column: "custom_field_id", values: ["16"] },
    });
  });
});

describe("history checks", () => {
  it("writes history checks in the data quality assertion language", () => {
    const checks = getGeneratedChecks({
      structure: { role: "role/HistoryDimension" },
      history: HISTORY,
    });

    expect(formatChecksYaml(checks)).toBe(`checks:
  - check: not_null
    table: hr.worker_position_history
    column: worker_id
    name: "Every version has a worker_id"

  - check: unique
    table: hr.worker_position_history
    column: worker_id
    name: "One current version per worker_id"
    where: "is_current = TRUE"

  - check: mutually_exclusive_ranges
    table: hr.worker_position_history
    lower: valid_from
    upper: valid_to
    partition_by: [worker_id]
    gaps: not_allowed
    name: "Versions of a worker_id don't overlap or leave gaps"

  - check: column_a_lte_column_b
    table: hr.worker_position_history
    a: valid_from
    b: valid_to
    operator: "<"
    or_null: true
    name: "valid_from is before valid_to"

  - check: expression_is_true
    table: hr.worker_position_history
    expression: "(is_current = TRUE) = (valid_to IS NULL)"
    name: "Only current versions have an open valid_to"

  - check: monotonic
    table: hr.worker_position_history
    column: version_number
    order_by: valid_from
    direction: increasing
    strictly: true
    partition_by: [worker_id]
    name: "version_number goes up with each version"
    severity: warn
`);
  });

  it("uses an open valid to as the current rule and allows gaps when the history isn't contiguous", () => {
    const checks = getGeneratedChecks({
      structure: { role: "role/HistoryDimension" },
      history: {
        ...HISTORY,
        columns: { ...HISTORY.columns, currentFlag: null, version: null },
        isContiguous: false,
      },
    });

    expect(checks.map(({ check }) => check)).toEqual([
      "not_null",
      "unique",
      "mutually_exclusive_ranges",
      "column_a_lte_column_b",
    ]);
    expect(checks[1].where).toBe("valid_to IS NULL");
    expect(checks[2].params.gaps).toBe("allowed");
  });

  it("checks the key and one version per time when the latest row per key is current", () => {
    const checks = getGeneratedChecks({
      structure: { role: "role/HistoryDimension" },
      history: {
        ...HISTORY,
        columns: {
          ...HISTORY.columns,
          validTo: null,
          currentFlag: null,
          version: null,
        },
      },
    });

    expect(checks.map(({ check }) => check)).toEqual([
      "not_null",
      "unique_combination",
    ]);
    expect(checks[1].params.columns).toEqual(["worker_id", "valid_from"]);
  });

  it("skips the version order check when the version column is valid from", () => {
    const checks = getGeneratedChecks({
      structure: { role: "role/HistoryDimension" },
      history: {
        ...HISTORY,
        columns: {
          ...HISTORY.columns,
          validTo: null,
          currentFlag: null,
          version: HISTORY.columns.validFrom,
        },
      },
    });

    expect(checks.map(({ check }) => check)).toEqual([
      "not_null",
      "unique_combination",
    ]);
  });

  it("returns no history checks for a table that isn't a history table", () => {
    expect(
      getGeneratedChecks({
        structure: { role: "role/Dimension" },
        history: HISTORY,
      }),
    ).toEqual([]);
  });
});

describe("getWorstFailingCheck", () => {
  const checks = getGeneratedChecks({
    structure: { role: "role/HistoryDimension" },
    history: HISTORY,
  });

  it("prefers a failing error over a failing warning", () => {
    const results = new Map([
      ["history:version-order", { status: "failing", summary: "warn" }],
      ["history:ranges", { status: "failing", summary: "error" }],
    ] as const);

    expect(getWorstFailingCheck(checks, results)?.id).toBe("history:ranges");
  });

  it("returns null when nothing fails", () => {
    expect(
      getWorstFailingCheck(
        checks,
        new Map([["history:ranges", { status: "passing" }]] as const),
      ),
    ).toBeNull();
  });
});
