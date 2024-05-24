import { parseValues } from "./utils";

describe("parseValues", () => {
  it("should parse comma-separated values", () => {
    expect(parseValues(``)).toEqual([]);
    expect(parseValues(`foo`)).toEqual(["foo"]);
    expect(parseValues(`foo,`)).toEqual(["foo", ""]);
    expect(parseValues(`foo,bar`)).toEqual(["foo", "bar"]);
    expect(parseValues(`foo,bar,`)).toEqual(["foo", "bar", ""]);
    expect(parseValues(`foo,bar,baz`)).toEqual(["foo", "bar", "baz"]);
  });

  it('should allow escaping commas with "', () => {
    expect(parseValues(`"bar,baz"`)).toEqual(["bar,baz"]);
    expect(parseValues(`foo,"bar,baz"`)).toEqual(["foo", "bar,baz"]);
    expect(parseValues(`"bar,baz",quu`)).toEqual(["bar,baz", "quu"]);
  });

  it("should allow escaping quotes commas with \\", () => {
    expect(parseValues(`"\\"baz\\""`)).toEqual(['"baz"']);
    expect(parseValues(`"bar,\\"baz\\""`)).toEqual(['bar,"baz"']);
    expect(parseValues(`"\\"baz\\",quu"`)).toEqual(['"baz",quu']);
  });
});
