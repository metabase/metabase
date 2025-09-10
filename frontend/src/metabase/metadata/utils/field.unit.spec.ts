import { NULL_DISPLAY_VALUE } from "metabase/lib/constants";
import MetabaseSettings from "metabase/lib/settings";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createOrdersProductIdField,
  createPeopleCreatedAtField,
  createPeopleNameField,
} from "metabase-types/api/mocks/presets";

import {
  areFieldsComparable,
  canCoerceFieldType,
  canFieldUnfoldJson,
  getFieldCurrency,
  getFieldDisplayName,
  getRawTableFieldId,
  isFieldJsonUnfolded,
} from "./field";

describe("areFieldsComparable", () => {
  it("should return true when both fields are type/MongoBSONID", () => {
    const field1 = createMockField({ effective_type: "type/MongoBSONID" });
    const field2 = createMockField({ effective_type: "type/MongoBSONID" });

    expect(areFieldsComparable(field1, field2)).toBe(true);
  });

  it("should return false for fields with different types when one is MongoBSONID", () => {
    const field1 = createMockField({ effective_type: "type/MongoBSONID" });
    const field2 = createMockField({ effective_type: "type/Text" });

    expect(areFieldsComparable(field1, field2)).toBe(false);
  });

  it("should return true for any non-MongoBSONID field types", () => {
    const field1 = createMockField({ effective_type: "type/Text" });
    const field2 = createMockField({ effective_type: "type/Number" });

    expect(areFieldsComparable(field1, field2)).toBe(true);
  });
});

describe("canCoerceFieldType", () => {
  it("should return true when field is not FK and is coerceable", () => {
    expect(canCoerceFieldType(createPeopleNameField())).toBe(true);
    expect(canCoerceFieldType(createPeopleCreatedAtField())).toBe(true);
  });

  it("should return false when field is FK", () => {
    const field = createOrdersProductIdField();

    expect(canCoerceFieldType(field)).toBe(false);
  });

  it("should return false when field is not coerceable", () => {
    expect(
      canCoerceFieldType(createMockField({ base_type: "type/Boolean" })),
    ).toBe(false);
  });
});

describe("getRawTableFieldId", () => {
  it("should return the field id when it's a number", () => {
    const field = createMockField({ id: 123 });

    expect(getRawTableFieldId(field)).toBe(123);
  });

  it("should throw an error when field id is not a number", () => {
    const field = createMockField({ id: ["field", 1, null] });

    expect(() => getRawTableFieldId(field)).toThrow(
      "getRawFieldId supports only raw table fields",
    );
  });
});

describe("getFieldCurrency", () => {
  it("returns currency from field settings when available", () => {
    const field = createMockField({
      settings: {
        currency: "EUR",
      },
    });

    expect(getFieldCurrency(field.settings)).toBe("EUR");
  });

  it("returns currency from global settings when field settings are not available", () => {
    MetabaseSettings.set("custom-formatting", {
      "type/Currency": {
        currency: "GBP",
      },
    });

    const field = createMockField();

    expect(getFieldCurrency(field.settings)).toBe("GBP");
  });

  it("returns USD as default when no currency is specified", () => {
    MetabaseSettings.set("custom-formatting", {});

    const field = createMockField();

    expect(getFieldCurrency(field.settings)).toBe("USD");
  });

  it("prioritizes field settings over global settings", () => {
    MetabaseSettings.set("custom-formatting", {
      "type/Currency": {
        currency: "GBP",
      },
    });

    const field = createMockField({
      settings: {
        currency: "JPY",
      },
    });

    expect(getFieldCurrency(field.settings)).toBe("JPY");
  });
});

describe("getFieldDisplayName", () => {
  it("should return dimension name when available", () => {
    const field = createMockField({
      name: "Name",
      display_name: "My field",
      dimensions: [{ id: 1, type: "internal", name: "Dimension Name" }],
    });

    expect(getFieldDisplayName(field)).toBe("Dimension Name");
  });

  it("should return display_name when dimensions are not available", () => {
    const field = createMockField({
      name: "Name",
      display_name: "My field",
    });

    expect(getFieldDisplayName(field)).toBe("My field");
  });

  it("should return name when neither dimensions nor display_name are available", () => {
    const field = createMockField({
      name: "Name",
      display_name: undefined,
    });

    expect(getFieldDisplayName(field)).toBe("Name");
  });

  it("should return name when neither dimensions are not available and display_name is empty", () => {
    const field = createMockField({
      name: "Name",
      display_name: "",
    });

    expect(getFieldDisplayName(field)).toBe("Name");
  });

  it("should return (empty) when no name is available", () => {
    const field = createMockField({
      name: "",
      display_name: "",
    });

    expect(getFieldDisplayName(field)).toBe(NULL_DISPLAY_VALUE);
  });

  it("should handle empty dimensions array", () => {
    const field = createMockField({
      display_name: "My field",
      dimensions: [],
    });

    expect(getFieldDisplayName(field)).toBe("My field");
  });

  it("should include table name in the result", () => {
    const field = createMockField({
      name: "Name",
      display_name: "My field",
    });
    const table = createMockTable({
      display_name: "My table",
    });

    expect(getFieldDisplayName(field, table)).toBe("My table → My field");
  });

  it("should include both schema and table names in the result", () => {
    const field = createMockField({
      name: "Name",
      display_name: "My field",
    });
    const table = createMockTable({
      display_name: "My table",
    });
    const schema = "public";

    expect(getFieldDisplayName(field, table, schema)).toBe(
      "Public.My table → My field",
    );
  });
});

describe("canFieldUnfoldJson", () => {
  it("returns true when field is JSON type and database supports nested fields", () => {
    const field = createMockField({ base_type: "type/JSON" });
    const database = createMockDatabase({
      features: ["nested-field-columns"],
    });

    expect(canFieldUnfoldJson(field, database)).toBe(true);
  });

  it("returns false when field is not JSON type", () => {
    const field = createMockField({ base_type: "type/Text" });
    const database = createMockDatabase({
      features: ["nested-field-columns"],
    });

    expect(canFieldUnfoldJson(field, database)).toBe(false);
  });

  it("returns false when database doesn't support nested fields", () => {
    const field = createMockField({ base_type: "type/JSON" });
    const database = createMockDatabase({
      features: ["basic-aggregations"],
    });

    expect(canFieldUnfoldJson(field, database)).toBe(false);
  });
});

describe("isFieldJsonUnfolded", () => {
  it("returns field's json_unfolding value when set", () => {
    const field = createMockField({ json_unfolding: false });
    const database = createMockDatabase();

    expect(isFieldJsonUnfolded(field, database)).toBe(false);
  });

  it("returns database's json-unfolding value when field's value is not set", () => {
    const field = createMockField({ json_unfolding: null });
    const database = createMockDatabase({
      details: {
        "json-unfolding": false,
      },
    });

    expect(isFieldJsonUnfolded(field, database)).toBe(false);
  });

  it("returns true when neither field nor database have values set", () => {
    const field = createMockField({ json_unfolding: null });
    const database = createMockDatabase();

    expect(isFieldJsonUnfolded(field, database)).toBe(true);
  });

  it("returns true when database's json-unfolding is not a boolean", () => {
    const field = createMockField();
    const database = createMockDatabase({
      details: {
        "json-unfolding": "xyz",
      },
    });

    expect(isFieldJsonUnfolded(field, database)).toBe(true);
  });

  it("prioritizes field's json_unfolding over database setting", () => {
    const field = createMockField({ json_unfolding: false });
    const database = createMockDatabase({
      details: {
        "json-unfolding": true,
      },
    });

    expect(isFieldJsonUnfolded(field, database)).toBe(false);
  });
});
