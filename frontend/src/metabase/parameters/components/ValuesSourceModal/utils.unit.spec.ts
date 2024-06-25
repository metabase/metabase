import { getValuesText, getStaticValues } from "./utils";

describe("getValuesText", () => {
  it("should stringify just values correctly", () => {
    expect(getValuesText(["Foo", "Bar", "Baz"])).toBe("Foo\nBar\nBaz");
  });
  it("should stringify just parameter values correctly", () => {
    expect(getValuesText([["Foo"], ["Bar"], ["Baz"]])).toBe("Foo\nBar\nBaz");
  });
  it("should stringify mixed parameter values correctly", () => {
    expect(getValuesText([["Foo"], "Bar", ["Baz"]])).toBe("Foo\nBar\nBaz");
  });
  it("should stringify just parameter values of different types correctly", () => {
    expect(getValuesText([[42], [true], ["Baz"], [null], [33.333]])).toBe(
      "42\n1\nBaz\n33.333",
    );
  });
  it("should stringify label-value pairs correctly", () => {
    expect(
      getValuesText([
        [42, "Foo"],
        [true, "Bar"],
        ["Baz", "Quu"],
        [null, "Qux"],
        [33.333, "Florb"],
      ]),
    ).toBe("42, Foo\n1, Bar\nBaz, Quu\n33.333, Florb");
  });
  it("should stringify mixed label-value and just values correctly", () => {
    expect(getValuesText([[42, "Foo"], ["Bar"], "Baz"])).toBe(
      "42, Foo\nBar\nBaz",
    );
  });
  it("should stringify values with commas by escaping them with quotes", () => {
    expect(getValuesText([["Foo,Bar"], "Baz,Quu"])).toBe(
      `"Foo,Bar"\n"Baz,Quu"`,
    );
  });
  it("should stringify value with tabs by escaping them with quotes", () => {
    expect(getValuesText([["Foo\tBar"]])).toBe(`"Foo\tBar"`);
  });
  it("should stringify value with newlines by escaping them with quotes", () => {
    expect(getValuesText([["Foo\nBar"]])).toBe(`"Foo\nBar"`);
  });

  it("should stringify labels", () => {
    expect(
      getValuesText([
        [10, "Foo"],
        [20, "Bar Baz"],
      ]),
    ).toBe(`10, Foo\n20, Bar Baz`);
  });

  it("should stringify label with commas by escaping them with quotes", () => {
    expect(
      getValuesText([
        [10, "Foo,Bar"],
        [20, "Baz,Quu"],
      ]),
    ).toBe(`10, "Foo,Bar"\n20, "Baz,Quu"`);
  });

  it("should stringify labels with newlines or tabs by escaping them with quotes", () => {
    expect(
      getValuesText([
        [10, "Foo,Bar"],
        [20, "Baz\tQuu"],
        [30, "Qux\nFlorb"],
      ]),
    ).toBe(`10, "Foo,Bar"\n20, "Baz\tQuu"\n30, "Qux\nFlorb"`);
  });
});

describe("getStaticValues", () => {
  it("should parse values correctly", () => {
    expect(getStaticValues("Foo\nBar\nBaz")).toEqual([
      ["Foo"],
      ["Bar"],
      ["Baz"],
    ]);
  });
  it("should parse value-label pairs correctly", () => {
    expect(getStaticValues("Foo,Bar\nBaz,Quu")).toEqual([
      ["Foo", "Bar"],
      ["Baz", "Quu"],
    ]);
  });
  it("should parse mixed value-label and just value pairs correctly", () => {
    expect(getStaticValues("Foo,Bar\nBaz")).toEqual([["Foo", "Bar"], ["Baz"]]);
  });
  it("should parse values with spaces", () => {
    expect(getStaticValues(`"Foo Bar"`)).toEqual([["Foo Bar"]]);
  });
  it("should parse escaped values", () => {
    expect(getStaticValues(`"Foo,Bar"`)).toEqual([["Foo,Bar"]]);
    expect(getStaticValues(`"Foo\tBar"`)).toEqual([["Foo\tBar"]]);
    expect(getStaticValues(`"Foo\nBar"`)).toEqual([["Foo\nBar"]]);
  });
  it("should parse labels with spaces", () => {
    expect(getStaticValues(`Foo, "Bar Baz"`)).toEqual([["Foo", "Bar Baz"]]);
  });
  it("should parse escaped labels", () => {
    expect(getStaticValues(`Foo, "Bar,Baz"`)).toEqual([["Foo", "Bar,Baz"]]);
    expect(getStaticValues(`Foo, "Bar\tBaz"`)).toEqual([["Foo", "Bar\tBaz"]]);
    expect(getStaticValues(`Foo, "Bar\nBaz"`)).toEqual([["Foo", "Bar\nBaz"]]);
  });
});
