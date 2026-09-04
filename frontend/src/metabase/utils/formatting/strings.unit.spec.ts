import { capitalize, conjunct, slugify } from "./strings";

describe("capitalize", () => {
  it("capitalizes a single word", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("capitalizes only the first char of a string", () => {
    expect(capitalize("hello world")).toBe("Hello world");
  });

  it("converts a string to lowercase by default", () => {
    expect(capitalize("heLLo")).toBe("Hello");
  });

  it("doesn't lowercase the string if option provided", () => {
    expect(capitalize("hellO WoRlD", { lowercase: false })).toBe("HellO WoRlD");
  });

  it("doesn't break on an empty string", () => {
    expect(capitalize("")).toBe("");
    expect(capitalize("", { lowercase: false })).toBe("");
  });
});

describe("conjunct", () => {
  it("returns a single item as-is", () => {
    expect(conjunct(["a"], "and")).toBe("a");
  });

  it("joins two items with the conjunction", () => {
    expect(conjunct(["a", "b"], "and")).toBe("a and b");
  });

  it("joins three or more items with commas and an Oxford comma", () => {
    expect(conjunct(["a", "b", "c"], "and")).toBe("a, b, and c");
    expect(conjunct(["a", "b", "c", "d"], "or")).toBe("a, b, c, or d");
  });

  it("returns an empty string for an empty list", () => {
    expect(conjunct([], "and")).toBe("");
  });

  it("coerces non-string values to strings", () => {
    expect(conjunct([1, 2], "and")).toBe("1 and 2");
    expect(conjunct([true, 0.5], "or")).toBe("true or 0.5");
  });

  it("doesn't drop falsy values (metabase#79555)", () => {
    expect(conjunct([0], "and")).toBe("0");
    expect(conjunct(["a", 0], "and")).toBe("a and 0");
    expect(conjunct([false, 0], "or")).toBe("false or 0");
  });
});

describe("slugify", () => {
  it("should slugify Chinese", () => {
    expect(slugify("類型")).toEqual("%E9%A1%9E%E5%9E%8B");
  });

  it("should slugify multiple words", () => {
    expect(slugify("Test Parameter")).toEqual("test_parameter");
  });

  it("should slugify Russian", () => {
    expect(slugify("русский язык")).toEqual(
      "%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9_%D1%8F%D0%B7%D1%8B%D0%BA",
    );
  });

  it("should slugify diacritics", () => {
    expect(slugify("än umlaut")).toEqual("%C3%A4n_umlaut");
  });
});
