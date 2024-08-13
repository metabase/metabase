import { parse } from "metabase-lib/v1/expressions/recursive-parser";
import { resolve } from "metabase-lib/v1/expressions/resolver";
import { infer } from "metabase-lib/v1/expressions/typeinferencer";

describe("metabase-lib/v1/expressions/typeinferencer", () => {
  function mockResolve(kind, name) {
    return ["field", name];
  }
  function compileAs(source, startRule) {
    let mbql = null;
    try {
      mbql = resolve({
        expression: parse(source),
        type: startRule,
        fn: mockResolve,
      });
    } catch (e) {}
    return mbql;
  }

  // workaround the limitation of the parsing expecting a strict top-level grammar rule
  function tryCompile(source) {
    let mbql = compileAs(source, "expression");
    if (mbql === null) {
      mbql = compileAs(source, "boolean");
    }
    return mbql;
  }

  function mockEnv(fieldRef) {
    switch (fieldRef[1]) {
      case "Price":
        return "number";
      case "FirstName":
      case "LastName":
        return "string";
      case "BirthDate":
      case "MiscDate":
        return "type/Temporal";
      case "Location":
      case "Place":
        return "type/Coordinate";
      case "CreatedAt":
        return "type/Datetime";
    }
  }

  function type(expression) {
    return infer(tryCompile(expression), mockEnv);
  }

  it("should infer the type of primitives", () => {
    expect(type("true")).toEqual("boolean");
    expect(type("false")).toEqual("boolean");
    expect(type("0")).toEqual("number");
    expect(type("1")).toEqual("number");
    expect(type("3.14159")).toEqual("number");
    expect(type('"Hola"')).toEqual("string");
    expect(type("'Bonjour!'")).toEqual("string");
  });

  it("should infer the result of arithmetic operations", () => {
    expect(type("[Price] + [Tax]")).toEqual("number");
    expect(type("1.15 * [Total]")).toEqual("number");
  });

  it("should infer the result of comparisons", () => {
    expect(type("[Discount] > 0")).toEqual("boolean");
    expect(type("[Revenue] <= [Limit] * 2")).toEqual("boolean");
    expect(type("[Price] != 2")).toEqual("boolean");
  });

  it("should infer the result of logical operations", () => {
    expect(type("NOT [Deal]")).toEqual("boolean");
    expect(type("[A] OR [B]")).toEqual("boolean");
    expect(type("[X] AND [Y]")).toEqual("boolean");
    expect(type("[Rating] < 3 AND [Price] > 100")).toEqual("boolean");
  });

  it("should infer parenthesized subexpression", () => {
    expect(type("(3.14159)")).toEqual("number");
    expect(type('((((("Hola")))))')).toEqual("string");
    expect(type("NOT ([Discount] > 0)")).toEqual("boolean");
  });

  it("should infer the result of numeric functions", () => {
    expect(type("SQRT(2)")).toEqual("number");
    expect(type("ABS([Latitude])")).toEqual("number");
    expect(type("FLOOR([Total] / 2.45)")).toEqual("number");
  });

  it("should infer the result of string functions", () => {
    expect(type("Ltrim([Name])")).toEqual("string");
    expect(type("Concat(Upper([LastN]), [FirstN])")).toEqual("string");
    expect(type("SUBSTRING([Product], 1, 3)")).toEqual("string");
    expect(type("Length([Category])")).toEqual("number");
    expect(type("Length([Category]) > 0")).toEqual("boolean");
  });

  it("should relay the field type", () => {
    expect(type("[Price]")).toEqual("number");
    expect(type("([FirstName])")).toEqual("string");
    expect(type("[BirthDate]")).toEqual("type/Temporal");
    expect(type("[Location]")).toEqual("type/Coordinate");
  });

  it("should infer the result of CASE", () => {
    expect(type("CASE([X], 1, 2)")).toEqual("number");
    expect(type("CASE([Y], 'this', 'that')")).toEqual("string");
    expect(type("CASE([Z], [Price]>100, [Price]>200)")).toEqual("boolean");
    expect(type("CASE([ABC], [FirstName], [LastName])")).toEqual("string");
    expect(type("CASE([F], [BirthDate], [MiscDate])")).toEqual("type/Temporal");
  });

  it("should infer the result of COALESCE", () => {
    expect(type("COALESCE([Price])")).toEqual("number");
    expect(type("COALESCE([FirstName], [LastName])")).toEqual("string");
    expect(type("COALESCE([BirthDate], [MiscDate])")).toEqual("type/Temporal");
    expect(type("COALESCE([Place], [Location])")).toEqual("type/Coordinate");
  });

  it("should infer the result of OFFSET", () => {
    expect(type("Offset([Price], -1)")).toEqual("number");
    expect(type("Offset([FirstName], -1)")).toEqual("string");
    expect(type("Offset([BirthDate], -1)")).toEqual("type/Temporal");
    expect(type("Offset([Place], -1)")).toEqual("type/Coordinate");
    expect(type("Offset(Sum([Price]), -1)")).toEqual("number");
  });

  it("should infer the result of datetimeAdd, datetimeSubtract", () => {
    expect(type('datetimeAdd([CreatedAt], 2, "month")')).toEqual("datetime");
    expect(type('datetimeAdd("2022-01-01", 2, "month")')).toEqual("datetime");
    expect(type('datetimeSubtract([CreatedAt], 2, "month")')).toEqual(
      "datetime",
    );
    expect(type('datetimeSubtract("2022-01-01", 2, "month")')).toEqual(
      "datetime",
    );
    expect(
      type(
        'datetimeSubtract(datetimeAdd("2022-01-01", 2, "month"), 4, "minute")',
      ),
    ).toEqual("datetime");
  });

  it("should infer the result of datetimeExtract functions", () => {
    const ops = [
      "year",
      "month",
      "quarter",
      "month",
      "week",
      "hour",
      "minute",
      "second",
    ];
    ops.forEach(op => {
      expect(type(`${op}([Created At])`)).toEqual("number");
    });
  });
});
