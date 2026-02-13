import { defineCompactSchema } from "./compact-schema";

describe("defineCompactSchema", () => {
  describe("required fields", () => {
    const schema = defineCompactSchema<{ name: string; age: number }>({
      name: "n",
      age: "a",
    });

    it("compacts required fields", () => {
      expect(schema.compact({ name: "Alice", age: 30 })).toEqual({
        n: "Alice",
        a: 30,
      });
    });

    it("expands required fields", () => {
      expect(schema.expand({ n: "Alice", a: 30 })).toEqual({
        name: "Alice",
        age: 30,
      });
    });

    it("returns null when a required field is missing on expand", () => {
      expect(schema.expand({ n: "Alice" })).toBeNull();
      expect(schema.expand({ a: 30 })).toBeNull();
      expect(schema.expand({})).toBeNull();
    });
  });

  describe("optional fields", () => {
    const schema = defineCompactSchema<{ id: number; label?: string }>({
      id: "i",
      label: { key: "l", optional: true },
    });

    it("omits optional undefined fields on compact", () => {
      expect(schema.compact({ id: 1 })).toEqual({ i: 1 });
    });

    it("includes optional fields when present on compact", () => {
      expect(schema.compact({ id: 1, label: "test" })).toEqual({
        i: 1,
        l: "test",
      });
    });

    it("omits optional fields from result when missing on expand", () => {
      expect(schema.expand({ i: 1 })).toEqual({ id: 1 });
    });

    it("includes optional fields when present on expand", () => {
      expect(schema.expand({ i: 1, l: "test" })).toEqual({
        id: 1,
        label: "test",
      });
    });

    it("preserves null values for optional fields", () => {
      expect(schema.compact({ id: 1, label: undefined })).toEqual({ i: 1 });
      expect(schema.expand({ i: 1, l: null })).toEqual({
        id: 1,
        label: null,
      });
    });
  });

  describe("default fields", () => {
    const schema = defineCompactSchema<{ id: number; label: string }>({
      id: "i",
      label: { key: "l", default: "" },
    });

    it("always writes default fields on compact", () => {
      expect(schema.compact({ id: 1, label: "" })).toEqual({ i: 1, l: "" });
    });

    it("uses default when field is missing on expand", () => {
      expect(schema.expand({ i: 1 })).toEqual({ id: 1, label: "" });
    });

    it("uses provided value when present on expand", () => {
      expect(schema.expand({ i: 1, l: "hello" })).toEqual({
        id: 1,
        label: "hello",
      });
    });
  });

  describe("nested schema fields", () => {
    const itemSchema = defineCompactSchema<{ id: number; name?: string }>({
      id: "i",
      name: { key: "n", optional: true },
    });

    const parentSchema = defineCompactSchema<{
      items: Array<{ id: number; name?: string }>;
    }>({
      items: { key: "I", schema: itemSchema, default: [] },
    });

    it("compacts nested arrays through the child schema", () => {
      expect(
        parentSchema.compact({
          items: [{ id: 1, name: "a" }, { id: 2 }],
        }),
      ).toEqual({
        I: [{ i: 1, n: "a" }, { i: 2 }],
      });
    });

    it("expands nested arrays through the child schema", () => {
      expect(parentSchema.expand({ I: [{ i: 1, n: "a" }, { i: 2 }] })).toEqual({
        items: [{ id: 1, name: "a" }, { id: 2 }],
      });
    });

    it("filters out invalid items on expand", () => {
      expect(parentSchema.expand({ I: [{ i: 1 }, {}, null] })).toEqual({
        items: [{ id: 1 }],
      });
    });

    it("uses default when nested array key is missing on expand", () => {
      expect(parentSchema.expand({})).toEqual({ items: [] });
    });
  });

  describe("round-trip integrity", () => {
    const innerSchema = defineCompactSchema<{
      definitionId: string;
      dimensionId?: string;
    }>({
      definitionId: "i",
      dimensionId: { key: "d", optional: true },
    });

    const outerSchema = defineCompactSchema<{
      id: string;
      type: string;
      label: string;
      display: string;
      definitions: Array<{ definitionId: string; dimensionId?: string }>;
      filter?: unknown;
      temporalUnit?: string;
    }>({
      id: "i",
      type: "t",
      label: { key: "l", default: "" },
      display: { key: "d", default: "line" },
      definitions: { key: "D", schema: innerSchema, default: [] },
      filter: { key: "f", optional: true },
      temporalUnit: { key: "u", optional: true },
    });

    it("round-trips a complex object with all fields", () => {
      const original = {
        id: "tab-1",
        type: "time",
        label: "By Month",
        display: "bar",
        definitions: [
          { definitionId: "metric:1", dimensionId: "dim-1" },
          { definitionId: "metric:2" },
        ],
        filter: { type: "relative", value: -30, unit: "day" },
        temporalUnit: "month",
      };

      const compacted = outerSchema.compact(original);
      const expanded = outerSchema.expand(compacted);
      expect(expanded).toEqual(original);
    });

    it("round-trips a minimal object with only required and default fields", () => {
      const original = {
        id: "tab-1",
        type: "time",
        label: "",
        display: "line",
        definitions: [],
      };

      const compacted = outerSchema.compact(original);
      const expanded = outerSchema.expand(compacted);
      expect(expanded).toEqual(original);
    });
  });

  describe("non-array nested values", () => {
    const itemSchema = defineCompactSchema<{ id: number }>({
      id: "i",
    });

    const parentSchema = defineCompactSchema<{
      items: Array<{ id: number }>;
    }>({
      items: { key: "I", schema: itemSchema, default: [] },
    });

    it("uses default when nested field is a non-array value on expand", () => {
      expect(parentSchema.expand({ I: "not-an-array" })).toEqual({
        items: [],
      });
      expect(parentSchema.expand({ I: 42 })).toEqual({ items: [] });
      expect(parentSchema.expand({ I: null })).toEqual({ items: [] });
    });

    it("uses default for nested field without default when value is non-array", () => {
      const schemaWithoutDefault = defineCompactSchema<{
        items: Array<{ id: number }>;
      }>({
        items: { key: "I", schema: itemSchema },
      });

      expect(schemaWithoutDefault.expand({ I: "not-an-array" })).toEqual({
        items: [],
      });
    });
  });

  describe("falsy field values", () => {
    const schema = defineCompactSchema<{
      count: number;
      label: string;
      flag: boolean;
    }>({
      count: "c",
      label: "l",
      flag: "f",
    });

    it("preserves falsy values (0, empty string, false) on compact", () => {
      expect(schema.compact({ count: 0, label: "", flag: false })).toEqual({
        c: 0,
        l: "",
        f: false,
      });
    });

    it("preserves falsy values on expand", () => {
      expect(schema.expand({ c: 0, l: "", f: false })).toEqual({
        count: 0,
        label: "",
        flag: false,
      });
    });
  });

  describe("null default values", () => {
    const schema = defineCompactSchema<{
      id: string;
      selected: string | null;
    }>({
      id: "i",
      selected: { key: "s", default: null },
    });

    it("uses null default on expand when key is missing", () => {
      expect(schema.expand({ i: "test" })).toEqual({
        id: "test",
        selected: null,
      });
    });

    it("preserves explicit null on expand", () => {
      expect(schema.expand({ i: "test", s: null })).toEqual({
        id: "test",
        selected: null,
      });
    });

    it("preserves non-null value on expand", () => {
      expect(schema.expand({ i: "test", s: "value" })).toEqual({
        id: "test",
        selected: "value",
      });
    });
  });

  describe("invalid input handling", () => {
    const schema = defineCompactSchema<{ id: number }>({ id: "i" });

    it("returns null for null input", () => {
      expect(schema.expand(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(schema.expand(undefined)).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(schema.expand("string")).toBeNull();
      expect(schema.expand(42)).toBeNull();
      expect(schema.expand(true)).toBeNull();
    });
  });
});
