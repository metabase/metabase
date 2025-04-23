import expression from "ts-dedent";

import { enclosingFunction } from "./position";

describe("enclosingFunction", () => {
  function setup(doc: string) {
    const pos = doc.indexOf("|");
    if (pos === -1) {
      throw new Error("Please use | to indicate the position of the cursor");
    }

    doc = doc.slice(0, pos) + doc.slice(pos + 1);
    return enclosingFunction(doc, pos);
  }

  it("should get the correct enclosing function and argument", () => {
    const result = {
      name: "is-null",
      from: 0,
      to: 10,
      arg: {
        from: 7,
        to: 10,
        index: 0,
      },
    };
    expect(setup("isnull(|[ID")).toEqual(result);
    expect(setup("isnull([|ID")).toEqual(result);
    expect(setup("isnull([I|D")).toEqual(result);
    expect(setup("isnull([ID|")).toEqual(result);
  });

  it("should ignore completed function construct", () => {
    expect(setup("Upper([Name])|")).toEqual(null);
    expect(setup("Upper([Name]) |")).toEqual(null);
  });

  it("should be case-insensitive", () => {
    expect(setup("CONCAT([Name]|")?.name).toEqual("concat");
  });

  it("should not match unknown functions", () => {
    expect(setup("foo([Name]|")).toEqual(null);
    expect(setup("concat(foo([Name]|")?.name).toEqual("concat");
  });

  it("should handle multiple arguments", () => {
    const result = {
      name: "concat",
      from: 0,
      to: 27,
      arg: {
        from: 22,
        to: 27,
        index: 2,
      },
    };
    expect(setup("concat(First, Middle, |Last ")).toEqual(result);
    expect(setup("concat(First, Middle, L|ast ")).toEqual(result);
    expect(setup("concat(First, Middle, La|st ")).toEqual(result);
    expect(setup("concat(First, Middle, Las|t ")).toEqual(result);
    expect(setup("concat(First, Middle, Last| ")).toEqual(result);
    expect(setup("concat(First, Middle, Last |")).toEqual(result);
  });

  it("should handle nested function calls", () => {
    expect(setup("Concat(X,Lower(Y,Z|")?.name).toEqual("lower");
    expect(setup("Concat(X|,Lower(Y,Z")?.name).toEqual("concat");
    expect(setup("Concat(X,Lower(Y,coalesce(Z|, A")?.name).toEqual("coalesce");
  });

  it("should ignore non-function calls", () => {
    expect(setup("1|")).toEqual(null);
    expect(setup("2 +|")).toEqual(null);
    expect(setup("X OR|")).toEqual(null);
  });

  it("should return undefined for functions with no arguments", () => {
    expect(setup("Count|()")).not.toEqual(null);
    expect(setup("|Count")).toEqual(null);
    expect(setup("C|ount")).toEqual(null);
    expect(setup("Co|unt")).toEqual(null);
    expect(setup("Cou|nt")).toEqual(null);
    expect(setup("Coun|t")).toEqual(null);
    expect(setup("Count| + 1")).toEqual(null);

    expect(setup("no|w()")).not.toEqual(null);
    expect(setup("|now")).toEqual(null);
    expect(setup("n|ow")).toEqual(null);
    expect(setup("no|w")).toEqual(null);
    expect(setup("now|")).toEqual(null);

    expect(setup("|now + 1")).toEqual(null);
    expect(setup("n|ow + 1")).toEqual(null);
    expect(setup("no|w + 1")).toEqual(null);
    expect(setup("now| + 1")).toEqual(null);

    expect(setup("concat(n|ow, 'bar')")).toEqual({
      name: "concat",
      from: 0,
      to: 18,
      arg: {
        index: 0,
        from: 7,
        to: 10,
      },
    });
  });

  it("should handle empty input", () => {
    expect(setup("|")).toEqual(null);
    expect(setup(" |")).toEqual(null);
  });

  it("should handle multiline input", () => {
    expect(
      setup(expression`
        datetimeDif|f(
          [CreatedAt],
          [UpdatedAt],
          "minute"
        )
      `),
    ).toEqual({
      name: "datetime-diff",
      from: 0,
      to: 56,
      arg: null,
    });

    expect(
      setup(expression`
        datetimeDiff(
          [CreatedAt]|,
          [UpdatedAt],
          "minute"
        )
      `),
    ).toEqual({
      name: "datetime-diff",
      from: 0,
      to: 56,
      arg: {
        index: 0,
        from: 16,
        to: 27,
      },
    });

    expect(
      setup(expression`
        datetimeDiff(
          [CreatedAt],
          [UpdatedAt],
          "minute"|
        )
      `),
    ).toEqual({
      name: "datetime-diff",
      from: 0,
      to: 56,
      arg: {
        index: 2,
        from: 46,
        to: 54,
      },
    });
  });
});
