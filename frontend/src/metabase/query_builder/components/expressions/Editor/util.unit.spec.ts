import { enclosingFunction } from "./util";

describe("enclosingFunction", () => {
  function setup(query: string) {
    const pos = query.indexOf("|");
    if (pos === -1) {
      throw new Error("please provide a cursor in position using |");
    }

    const doc = query.slice(0, pos) + query.slice(pos + 1);
    return enclosingFunction(doc, pos);
  }

  it("should find the enclosing function when it doesn't have an opening parenthesis", () => {
    const result = {
      name: "concat",
      from: 0,
      to: 6,
      arg: null,
    };

    expect(setup("|concat")).toEqual(result);
    expect(setup("conc|at")).toEqual(result);
    expect(setup("concat|")).toEqual(result);
  });

  it("should find the enclosing function when it doesn't have args", () => {
    const result = {
      name: "concat",
      from: 0,
      to: 7,
      arg: null,
    };

    expect(setup("|concat(")).toEqual(result);
    expect(setup("conca|t(")).toEqual(result);
    expect(setup("concat(|")).toEqual(result);
  });

  it("should find the enclosing function when it doesn't have a closing parenthesis", () => {
    const result = {
      name: "concat",
      from: 0,
      to: 11,
      arg: null,
    };

    expect(setup("|concat(a, b")).toEqual(result);
    expect(setup("conca|t(a, b")).toEqual(result);
    expect(setup("concat(a|, b")).toEqual({
      ...result,
      arg: {
        index: 0,
        from: 7,
        to: 8,
      },
    });
    expect(setup("concat(a, b|")).toEqual({
      ...result,
      arg: {
        index: 1,
        from: 10,
        to: 11,
      },
    });
  });

  it("should find the enclosing function when it has a closing parenthesis", () => {
    const result = {
      name: "concat",
      from: 0,
      to: 14,
      arg: null,
    };

    expect(setup("|concat(10, 20)")).toEqual(result);
    expect(setup("conca|t(10, 20)")).toEqual(result);
    expect(setup("concat(1|0, 20)")).toEqual({
      ...result,
      arg: {
        index: 0,
        from: 7,
        to: 9,
      },
    });
    expect(setup("concat(10, 2|0)")).toEqual({
      ...result,
      arg: {
        index: 1,
        from: 11,
        to: 13,
      },
    });
  });

  it("should not find an enclosing function when it the cursor is set after the closing parenthesis", () => {
    expect(setup("concat(a, b)|")).toBe(null);
    expect(setup("concat(a, b) |")).toBe(null);
  });

  it("should find the innermost enclosing function", () => {
    expect(setup("case([X] > 10, concat(a, b|), coalesce(c, d))")).toEqual({
      name: "concat",
      from: 15,
      to: 27,
      arg: {
        index: 1,
        from: 25,
        to: 26,
      },
    });
  });

  it("should work when the function is a part of another expression", () => {
    expect(setup("10 + case([X] > | 10, 20, 30)")).toEqual({
      name: "case",
      from: 5,
      to: 28,
      arg: {
        index: 0,
        from: 10,
        to: 19,
      },
    });
  });
});
