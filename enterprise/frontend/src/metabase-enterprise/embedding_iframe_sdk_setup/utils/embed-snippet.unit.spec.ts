import { formatAttributeValue } from "./embed-snippet";

describe("formatAttributeValue", () => {
  it("should format string values correctly", () => {
    expect(formatAttributeValue("hello")).toBe('"hello"');
  });

  it("should format number values correctly", () => {
    expect(formatAttributeValue(42)).toBe('"42"');
    expect(formatAttributeValue(3.14)).toBe('"3.14"');
  });

  it("should format boolean values correctly", () => {
    expect(formatAttributeValue(true)).toBe('"true"');
    expect(formatAttributeValue(false)).toBe('"false"');
  });

  it("should format array values correctly", () => {
    expect(formatAttributeValue([1, 2, 3])).toBe("'[1,2,3]'");
    expect(formatAttributeValue(["a", "b", "c"])).toBe('\'["a","b","c"]\'');
    expect(formatAttributeValue([1, "b", true])).toBe("'[1,\"b\",true]'");
  });

  it("should HTML escape single quotes in array and objects", () => {
    expect(formatAttributeValue(["O'Reilly", "D'Angelo"])).toBe(
      `'["O&39;Reilly","D&39;Angelo"]'`,
    );
    expect(formatAttributeValue({ quote: "It's a test" })).toBe(
      `'{"quote":"It&39;s a test"}'`,
    );
  });

  it("should HTML escape single quotes in nested arrays and objects", () => {
    expect(
      formatAttributeValue([{ name: "O'Reilly" }, { name: "D'Angelo" }]),
    ).toBe(`'[{"name":"O&39;Reilly"},{"name":"D&39;Angelo"}]'`);
    expect(formatAttributeValue({ nested: { quote: "It's a test" } })).toBe(
      `'{"nested":{"quote":"It&39;s a test"}}'`,
    );
  });

  it("should format object values correctly", () => {
    expect(formatAttributeValue({ key: "value" })).toBe(`'{"key":"value"}'`);
    expect(formatAttributeValue({ a: 1, b: true })).toBe(`'{"a":1,"b":true}'`);
  });

  it("should handle nested arrays and objects", () => {
    expect(formatAttributeValue([{ a: 1 }, { b: 2 }])).toBe(
      `'[{"a":1},{"b":2}]'`,
    );
    expect(
      formatAttributeValue([
        [1, 2],
        [3, 4],
      ]),
    ).toBe("'[[1,2],[3,4]]'");
  });

  it("should handle null and undefined values", () => {
    expect(formatAttributeValue(null)).toBe("'null'");
    expect(formatAttributeValue(undefined)).toBe('"undefined"');
  });
});
