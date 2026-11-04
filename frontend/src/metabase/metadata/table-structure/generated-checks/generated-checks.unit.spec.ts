import type { CustomPropertyChecksInput } from "./custom-property-checks";
import { getGeneratedChecks } from "./generated-checks";
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
