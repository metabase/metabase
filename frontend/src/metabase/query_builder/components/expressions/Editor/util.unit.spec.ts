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
    };

    expect(setup("|concat(a, b")).toEqual(result);
    expect(setup("conca|t(a, b")).toEqual(result);
    expect(setup("concat(a|, b")).toEqual(result);
    expect(setup("concat(a, b|")).toEqual(result);
  });

  it("should find the enclosing function when it has a closing parenthesis", () => {
    const result = {
      name: "concat",
      from: 0,
      to: 14,
    };

    expect(setup("|concat(10, 20)")).toEqual(result);
    expect(setup("conca|t(10, 20)")).toEqual(result);
    expect(setup("concat(1|0, 20)")).toEqual(result);
    expect(setup("concat(10, 2|0)")).toEqual(result);
  });

  it("should not find an enclosing function when it the cursor is set after the closing parenthesis", () => {
    expect(setup("concat(a, b)|")).toBe(null);
    expect(setup("concat(a, b) |")).toBe(null);
  });

  it("should find the innermost enclosing function", () => {
    expect(setup("case([X] > 10, concat(a|, b), coalesce(c, d))")).toEqual({
      name: "concat",
      from: 15,
      to: 27,
    });
  });

  it("should work when the function is a part of another expression", () => {
    expect(setup("10 + case([X] > | 10, 20, 30)")).toEqual({
      name: "case",
      from: 5,
      to: 28,
    });
  });
});
