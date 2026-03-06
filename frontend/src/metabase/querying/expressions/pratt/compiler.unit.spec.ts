import * as Lib from "metabase-lib";

import { compileExpression } from "../compile-expression";
import { query } from "../test/shared";
import { value } from "../test/utils";
import type { ExpressionType } from "../types";

import { compile, lexify, parse } from ".";

function bigint(x: string) {
  return value(x, "type/BigInteger");
}

describe("pratt/compiler", () => {
  function expr(source: string) {
    const tokens = lexify(source);
    const root = parse(tokens);

    return compile(root, {
      expressionMode: "expression",
    });
  }

  describe("(for an expression)", () => {
    it("should compile literals as raw values", () => {
      // Top-level literals should be returned as raw values, not wrapped in :value clauses.
      // This matches how filter clauses are created and allows wrap-value-literals QP middleware
      // to add proper type info from the column being compared.
      expect(expr("42")).toEqual(42);
      expect(expr("'Universe'")).toEqual("Universe");
      expect(expr(`"Universe"`)).toEqual("Universe");
      expect(expr(`"\\""`)).toEqual(`"`);
      expect(expr(`'\\''`)).toEqual(`'`);
      expect(expr(`"a\\"b"`)).toEqual(`a"b`);
      expect(expr(`'a\\'b'`)).toEqual(`a'b`);
      expect(expr(`"'"`)).toEqual(`'`);
      expect(expr(`'"'`)).toEqual(`"`);
    });

    it("should compile bigints wrapped in :value clause", () => {
      // Bigints need to be wrapped because they must be serialized as strings
      // and need type info to be parsed correctly
      expect(expr("12309109320930192039")).toEqual(
        bigint("12309109320930192039"),
      );
      expect(expr("-12309109320930192039")).toEqual(
        bigint("-12309109320930192039"),
      );

      expect(expr("1 + 12309109320930192039")).toEqual({
        operator: "+",
        options: {},
        args: [1, bigint("12309109320930192039")],
      });
    });

    it("should compile dimensions", () => {
      expect(expr("[Price]")).toEqual({
        operator: "dimension",
        options: {},
        args: ["Price"],
      });
      expect(expr("([X])")).toEqual({
        operator: "dimension",
        options: {},
        args: ["X"],
      });
    });

    it("should compile arithmetic operations", () => {
      expect(expr("1+2")).toEqual({
        operator: "+",
        options: {},
        args: [1, 2],
      });
      expect(expr("3-4")).toEqual({
        operator: "-",
        options: {},
        args: [3, 4],
      });
      expect(expr("5*6")).toEqual({
        operator: "*",
        options: {},
        args: [5, 6],
      });
      expect(expr("7/8")).toEqual({
        operator: "/",
        options: {},
        args: [7, 8],
      });
      expect(expr("-(1+2)")).toEqual({
        operator: "-",
        options: {},
        args: [
          {
            operator: "+",
            options: {},
            args: [1, 2],
          },
        ],
      });
      expect(expr("-12")).toEqual(-12);
    });

    it("should compile comparisons", () => {
      expect(expr("1<2")).toEqual({
        operator: "<",
        options: {},
        args: [1, 2],
      });
      expect(expr("3>4")).toEqual({
        operator: ">",
        options: {},
        args: [3, 4],
      });
      expect(expr("5<=6")).toEqual({
        operator: "<=",
        options: {},
        args: [5, 6],
      });
      expect(expr("7>=8")).toEqual({
        operator: ">=",
        options: {},
        args: [7, 8],
      });
      expect(expr("9=9")).toEqual({
        operator: "=",
        options: {},
        args: [9, 9],
      });
      expect(expr("9!=0")).toEqual({
        operator: "!=",
        options: {},
        args: [9, 0],
      });
    });

    it("should compile logical operators", () => {
      expect(expr("7 or 8")).toEqual({
        operator: "or",
        options: {},
        args: [7, 8],
      });
      expect(expr("7 and 8")).toEqual({
        operator: "and",
        options: {},
        args: [7, 8],
      });
      expect(expr("7 and Size")).toEqual({
        operator: "and",
        options: {},
        args: [
          7,
          {
            operator: "dimension",
            options: {},
            args: ["Size"],
          },
        ],
      });
      expect(expr("NOT (7 and Size)")).toEqual({
        operator: "not",
        options: {},
        args: [
          {
            operator: "and",
            options: {},
            args: [
              7,
              {
                operator: "dimension",
                options: {},
                args: ["Size"],
              },
            ],
          },
        ],
      });
    });

    it("should compile repeated infix operators", () => {
      expect(expr("1 + 2 + 3 + 4 + 5 + 6")).toEqual({
        operator: "+",
        options: {},
        args: [1, 2, 3, 4, 5, 6],
      });
    });

    it("should parse function calls", () => {
      expect(expr("ceil(3.14)")).toEqual({
        operator: "ceil",
        options: {},
        args: [3.14],
      });
      expect(expr("log(1 + sqrt(9))")).toEqual({
        operator: "log",
        options: {},
        args: [
          {
            operator: "+",
            options: {},
            args: [
              1,
              {
                operator: "sqrt",
                options: {},
                args: [9],
              },
            ],
          },
        ],
      });
      expect(expr("power(log(2.1), 7)")).toEqual({
        operator: "power",
        options: {},
        args: [
          {
            operator: "log",
            options: {},
            args: [2.1],
          },
          7,
        ],
      });
      expect(expr("trim(ID)")).toEqual({
        operator: "trim",
        options: {},
        args: [
          {
            operator: "dimension",
            options: {},
            args: ["ID"],
          },
        ],
      });
      expect(expr("text(ID)")).toEqual({
        operator: "text",
        options: {},
        args: [
          {
            operator: "dimension",
            options: {},
            args: ["ID"],
          },
        ],
      });
      expect(expr("integer(ID)")).toEqual({
        operator: "integer",
        options: {},
        args: [
          {
            operator: "dimension",
            options: {},
            args: ["ID"],
          },
        ],
      });
    });

    it("should handle parenthesized expression", () => {
      expect(expr("(42)")).toEqual(42);
      expect(expr("-42")).toEqual(-42);
      expect(expr("-(42)")).toEqual(-42);
      expect(expr("((43))")).toEqual(43);
      expect(expr("('Universe')")).toEqual("Universe");
      expect(expr("(('Answer'))")).toEqual("Answer");
      expect(expr("(1+2)")).toEqual({
        operator: "+",
        options: {},
        args: [1, 2],
      });
      expect(expr("(1+2)/3")).toEqual({
        operator: "/",
        options: {},
        args: [
          {
            operator: "+",
            options: {},
            args: [1, 2],
          },
          3,
        ],
      });
      expect(expr("4-(5*6)")).toEqual({
        operator: "-",
        options: {},
        args: [
          4,
          {
            operator: "*",
            options: {},
            args: [5, 6],
          },
        ],
      });
      expect(expr("concat(5*6, 4-3)")).toEqual({
        operator: "concat",
        options: {},
        args: [
          { operator: "*", options: {}, args: [5, 6] },
          { operator: "-", options: {}, args: [4, 3] },
        ],
      });
    });

    it("should correctly handle the mode option for datetime functions", () => {
      expect(expr('datetime("2024-01-08")')).toEqual({
        operator: "datetime",
        options: {},
        args: ["2024-01-08"],
      });
      expect(expr('datetime(10, "unixSeconds")')).toEqual({
        operator: "datetime",
        options: { mode: "unix-seconds" },
        args: [10],
      });
    });
  });

  describe("Should match the old compiler", () => {
    it("Seed 59793: NOT NOT [p]<0", () => {
      expect(expr("NOT NOT [p] < 0")).toEqual({
        operator: "not",
        options: {},
        args: [
          {
            operator: "not",
            options: {},
            args: [
              {
                operator: "<",
                options: {},
                args: [{ operator: "dimension", options: {}, args: ["p"] }, 0],
              },
            ],
          },
        ],
      });
    });

    it("Seed 59809: NOT ( ( [gG9_r]) )  >=( [__] )", () => {
      expect(expr("NOT ( ( [gG9_r]) )  >=( [__] )")).toEqual({
        operator: "not",
        options: {},
        args: [
          {
            operator: ">=",
            options: {},
            args: [
              { operator: "dimension", options: {}, args: ["gG9_r"] },
              { operator: "dimension", options: {}, args: ["__"] },
            ],
          },
        ],
      });
    });

    // note, changed from original to accommodate validation of substring args
    it(`Seed 10099: CONtAinS ( [OF4wuV], SUbstriNG("_", 1, lENGtH("s Mfg7" ) ) )`, () => {
      const compiled = expr(
        `CONtAinS ( [OF4wuV], SUbstriNG("_", 1, lENGtH("s Mfg7" ) ) )`,
      );
      expect(compiled).toEqual({
        operator: "contains",
        options: {},
        args: [
          { operator: "dimension", options: {}, args: ["OF4wuV"] },
          {
            operator: "substring",
            options: {},
            args: [
              "_",
              1,
              { operator: "length", options: {}, args: ["s Mfg7"] },
            ],
          },
        ],
      });
    });

    it(`Seed 10092:  NOT ( NOT   (isNUll ([T0q → n_M_O])))`, () => {
      const compiled = expr(` NOT ( NOT   (isNUll ([T0q → n_M_O])))`);
      expect(compiled).toEqual({
        operator: "not",
        options: {},
        args: [
          {
            operator: "not",
            options: {},
            args: [
              {
                operator: "is-null",
                options: {},
                args: [
                  { operator: "dimension", options: {}, args: ["T0q → n_M_O"] },
                ],
              },
            ],
          },
        ],
      });
    });

    it(`Seed 10082: SUbstriNg( cOncat("BaK2    ", [__m_4], rTrim(coNcAt (replACE ([Av5Wtbz], regeXextRACt( [_1I → g], "H NVB84_"), rEGexextract ( [__8], " _ 2" )  ) , SUbStRiNG("qb0  ", (power( LeNgTh ( rtrim ( "YyCe_2" )) * 0e+77, 1 ) ), 1 + 0e-54 / 374719e-64) , cOncaT( "    F9 _O", "_a5_", " 5 _U_ ", " bE", rEPlACe (BXj3O, " ", [Z → X9]) ) )  )  ), (1), log ( 1E-26 )  )`, () => {
      const compiled = expr(
        `SUbstriNg( cOncat("BaK2    ", [__m_4], rTrim(coNcAt (replACE ([Av5Wtbz], regeXextRACt( [_1I → g], "H NVB84_"), rEGexextract ( [__8], " _ 2" )  ) , SUbStRiNG("qb0  ", (power( LeNgTh ( rtrim ( "YyCe_2" )) * 0e+77, 1 ) ), 1 + 0e-54 / 374719e-64) , cOncaT( "    F9 _O", "_a5_", " 5 _U_ ", " bE", rEPlACe (BXj3O, " ", [Z → X9]) ) )  )  ), (1), log ( 1E-26 )  )`,
      );

      expect(compiled).toEqual({
        operator: "substring",
        options: {},
        args: [
          {
            operator: "concat",
            options: {},
            args: [
              "BaK2    ",
              {
                operator: "dimension",
                options: {},
                args: ["__m_4"],
              },
              {
                operator: "rtrim",
                options: {},
                args: [
                  {
                    operator: "concat",
                    options: {},
                    args: [
                      {
                        operator: "replace",
                        options: {},
                        args: [
                          {
                            operator: "dimension",
                            options: {},
                            args: ["Av5Wtbz"],
                          },
                          {
                            operator: "regex-match-first",
                            options: {},
                            args: [
                              {
                                operator: "dimension",
                                options: {},
                                args: ["_1I → g"],
                              },
                              "H NVB84_",
                            ],
                          },
                          {
                            operator: "regex-match-first",
                            options: {},
                            args: [
                              {
                                operator: "dimension",
                                options: {},
                                args: ["__8"],
                              },
                              " _ 2",
                            ],
                          },
                        ],
                      },
                      {
                        operator: "substring",
                        options: {},
                        args: [
                          "qb0  ",
                          {
                            operator: "power",
                            options: {},
                            args: [
                              {
                                operator: "*",
                                options: {},
                                args: [
                                  {
                                    operator: "length",
                                    options: {},
                                    args: [
                                      {
                                        operator: "rtrim",
                                        options: {},
                                        args: ["YyCe_2"],
                                      },
                                    ],
                                  },
                                  0,
                                ],
                              },
                              1,
                            ],
                          },
                          {
                            operator: "+",
                            options: {},
                            args: [
                              1,
                              {
                                operator: "/",
                                options: {},
                                args: [0, 3.74719e-59],
                              },
                            ],
                          },
                        ],
                      },
                      {
                        operator: "concat",
                        options: {},
                        args: [
                          "    F9 _O",
                          "_a5_",
                          " 5 _U_ ",
                          " bE",
                          {
                            operator: "replace",
                            options: {},
                            args: [
                              {
                                operator: "dimension",
                                options: {},
                                args: ["BXj3O"],
                              },
                              " ",
                              {
                                operator: "dimension",
                                options: {},
                                args: ["Z → X9"],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          1,
          { operator: "log", options: {}, args: [1e-26] },
        ],
      });
    });

    it(`Seed 57808:  (( Abs (  (exP( cEil(  - 1e+48) )) )  * -1e31 ) * ( poWeR( (( - 0e+67) *lengTh ( "8" )  ) ,  ( -1 ) *lengTh( "Q  P2c n" ) / powEr(1, N) ) )  )`, () => {
      const compiled = expr(
        `(( Abs (  (exP( cEil(  - 1e+48) )) )  * -1e31 ) * ( poWeR( (( - 0e+67) *lengTh ( "8" )  ) ,  ( -1 ) *lengTh( "Q  P2c n" ) / powEr(1, N) ) )  )`,
      );

      expect(compiled).toEqual({
        operator: "*",
        options: {},
        args: [
          {
            operator: "abs",
            options: {},
            args: [
              {
                operator: "exp",
                options: {},
                args: [{ operator: "ceil", options: {}, args: [-1e48] }],
              },
            ],
          },
          -1e31,
          {
            operator: "power",
            options: {},
            args: [
              {
                operator: "*",
                options: {},
                args: [
                  -0,
                  {
                    operator: "length",
                    options: {},
                    args: ["8"],
                  },
                ],
              },
              {
                operator: "/",
                options: {},
                args: [
                  {
                    operator: "*",
                    options: {},
                    args: [
                      -1,
                      {
                        operator: "length",
                        options: {},
                        args: ["Q  P2c n"],
                      },
                    ],
                  },
                  {
                    operator: "power",
                    options: {},
                    args: [
                      1,
                      {
                        operator: "dimension",
                        options: {},
                        args: ["N"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
    });

    it(`seed 10144: eNDsWith( "NTP", replacE( [V2FFf → r_8ZFu], coalescE(repLACe([cf → l], sUbStriNg ( Replace( [A], "L ", "b"), coAlEsCE(953925E-38, 307355.510173e+32 ), pOwEr (1e+15, 0 )) , caSe ( IsEMpTy( [_ → _3H_6b]) , cOncat ("n_F e_B n" ) , isEmptY([E → _3R6p6_]), conCat(" D 2h", " 4 9u ", "A_9_M_9_", " q _")) ) , RegExeXtRact ([_PI9], "K43s 6") ) , sUBstriNg (CaSE (intervAl( [_OU9c], - 632269.595767E-79, CoalESce ("u__0_71", "c ")), CoalesCe( suBstriNG ( "XPHC0 li_", 500924.700063e-10, 341369) )), - 1E+47 - (424024.827478-1 ), - 1) ) )`, () => {
      const compiled = expr(
        `eNDsWith( "NTP", replacE( [V2FFf → r_8ZFu], coalescE(repLACe([cf → l], sUbStriNg ( Replace( [A], "L ", "b"), coAlEsCE(953925E-38, 307355.510173e+32 ), pOwEr (1e+15, 0 )) , caSe ( IsEMpTy( [_ → _3H_6b]) , cOncat ("n_F e_B n" ) , isEmptY([E → _3R6p6_]), conCat(" D 2h", " 4 9u ", "A_9_M_9_", " q _")) ) , RegExeXtRact ([_PI9], "K43s 6") ) , sUBstriNg (CaSE (intervAl( [_OU9c], - 632269.595767E-79, CoalESce ("u__0_71", "c ")), CoalesCe( suBstriNG ( "XPHC0 li_", 500924.700063e-10, 341369) )), - 1E+47 - (424024.827478-1 ), - 1) ) )`,
      );

      expect(compiled).toEqual({
        operator: "ends-with",
        options: {},
        args: [
          "NTP",
          {
            operator: "replace",
            options: {},
            args: [
              { operator: "dimension", options: {}, args: ["V2FFf → r_8ZFu"] },
              {
                operator: "coalesce",
                options: {},
                args: [
                  {
                    operator: "replace",
                    options: {},
                    args: [
                      { operator: "dimension", options: {}, args: ["cf → l"] },
                      {
                        operator: "substring",
                        options: {},
                        args: [
                          {
                            operator: "replace",
                            options: {},
                            args: [
                              {
                                operator: "dimension",
                                options: {},
                                args: ["A"],
                              },
                              "L ",
                              "b",
                            ],
                          },
                          {
                            operator: "coalesce",
                            options: {},
                            args: [9.53925e-33, 3.07355510173e37],
                          },
                          {
                            operator: "power",
                            options: {},
                            args: [1000000000000000, 0],
                          },
                        ],
                      },
                      {
                        operator: "case",
                        options: {},
                        args: [
                          {
                            operator: "is-empty",
                            options: {},
                            args: [
                              {
                                operator: "dimension",
                                options: {},
                                args: ["_ → _3H_6b"],
                              },
                            ],
                          },
                          {
                            operator: "concat",
                            options: {},
                            args: ["n_F e_B n"],
                          },
                          {
                            operator: "is-empty",
                            options: {},
                            args: [
                              {
                                operator: "dimension",
                                options: {},
                                args: ["E → _3R6p6_"],
                              },
                            ],
                          },
                          {
                            operator: "concat",
                            options: {},
                            args: [" D 2h", " 4 9u ", "A_9_M_9_", " q _"],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    operator: "regex-match-first",
                    options: {},
                    args: [
                      { operator: "dimension", options: {}, args: ["_PI9"] },
                      "K43s 6",
                    ],
                  },
                ],
              },
              {
                operator: "substring",
                options: {},
                args: [
                  {
                    operator: "case",
                    options: {},
                    args: [
                      {
                        operator: "time-interval",
                        options: {},
                        args: [
                          {
                            operator: "dimension",
                            options: {},
                            args: ["_OU9c"],
                          },
                          -6.32269595767e-74,
                          {
                            operator: "coalesce",
                            options: {},
                            args: ["u__0_71", "c "],
                          },
                        ],
                      },
                      {
                        operator: "coalesce",
                        options: {},
                        args: [
                          {
                            operator: "substring",
                            options: {},
                            args: ["XPHC0 li_", 0.0000500924700063, 341369],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    operator: "-",
                    options: {},
                    args: [
                      -1e47,
                      { operator: "-", options: {}, args: [424024.827478, 1] },
                    ],
                  },
                  -1,
                ],
              },
            ],
          },
        ],
      });
    });

    it("Merging subtraction", () => {
      const compiled = expr(`1 - (0 - -10)`);
      expect(compiled).toEqual({
        operator: "-",
        options: {},
        args: [1, { operator: "-", options: {}, args: [0, -10] }],
      });
    });

    it("should throw error on inclomplete expressions", () => {
      expect(() => expr(`1 +`)).toThrow("Expected expression");
    });

    it("should throw error on unknown function", () => {
      expect(() => expr(`unknown_fn(1)`)).toThrow(
        "Unknown function unknown_fn",
      );
    });
  });
});

describe("resolve", () => {
  function collect(
    source: string,
    expressionMode: Lib.ExpressionMode = "expression",
  ) {
    const fields: string[] = [];
    const segments: string[] = [];
    const metrics: string[] = [];

    const stageIndex = -1;

    const res = compileExpression({
      source,
      expressionMode,
      query,
      stageIndex,
      availableColumns: Lib.expressionableColumns(query, stageIndex),
      resolver(type: ExpressionType, name: string) {
        if (type === "boolean") {
          segments.push(name);
        } else if (type === "aggregation") {
          metrics.push(name);
        } else {
          fields.push(name);
        }
        return {
          operator: "value",
          options: {},
          args: [name],
        };
      },
    });

    if (res.error) {
      throw res.error;
    }

    return {
      fields,
      segments,
      metrics,
      expression: res.expressionParts,
    };
  }

  const expression = (expr: string) => collect(expr, "expression");
  const filter = (expr: string) => collect(expr, "filter");
  const aggregation = (expr: string) => collect(expr, "aggregation");

  describe("for filters", () => {
    it("should resolve segments correctly", () => {
      expect(filter(`[A]`).segments).toEqual(["A"]);
      expect(filter(`not [B]`).segments).toEqual(["B"]);
      expect(filter(`not not [C]`).segments).toEqual(["C"]);
      expect(filter(`[P] > 3`).segments).toEqual([]);
      expect(filter(`Q < 1 and [R]`).segments).toEqual(["R"]);
      expect(filter(`isNull([S])`).segments).toEqual([]);
      expect(filter(`notEmpty([S])`).segments).toEqual([]);
      expect(filter(`lower([A]) > "X"`).segments).toEqual([]);
      expect(filter(`sqrt([B]) < 1`).segments).toEqual([]);
      expect(filter(`contains([C], "SomeString")`).segments).toEqual([]);
      expect(filter(`doesNotContain([C], "somestring")`).segments).toEqual([]);
      expect(filter(`[P] or [Q] > 3`).segments).toEqual(["P"]);
    });

    it("should resolve fields correctly", () => {
      expect(filter(`[A]`).fields).toEqual([]);
      expect(filter(`not [B]`).fields).toEqual([]);
      expect(filter(`not not [C]`).fields).toEqual([]);
      expect(filter(`[P] > 3`).fields).toEqual(["P"]);
      expect(filter(`Q < 1 and [R]`).fields).toEqual(["Q"]);
      expect(filter(`isNull([S])`).fields).toEqual(["S"]);
      expect(filter(`notEmpty([S])`).fields).toEqual(["S"]);
      expect(filter(`lower([A]) > "X"`).fields).toEqual(["A"]);
      expect(filter(`sqrt([B]) < 1`).fields).toEqual(["B"]);
      expect(filter(`contains([C], "SomeString")`).fields).toEqual(["C"]);
      expect(filter(`[P] or [Q] > 3`).fields).toEqual(["Q"]);
      expect(filter(`contains([C], "somestring")`).fields).toEqual(["C"]);
      expect(filter(`doesNotContain([C], "somestring")`).fields).toEqual(["C"]);
    });

    it("should work on functions with optional flag", () => {
      expect(() =>
        filter(`interval([A], 3, "day", "include-current")`),
      ).not.toThrow();
    });
  });

  describe("for expressions (for custom columns)", () => {
    it("should resolve segments correctly", () => {
      expect(expression(`trim([A])`).segments).toEqual([]);
      expect(expression(`round([B])`).segments).toEqual([]);
      expect(expression(`concat([S])`).segments).toEqual([]);
      expect(expression(`concat([A], [B])`).segments).toEqual([]);
      expect(expression(`coalesce([P])`).segments).toEqual([]);
      expect(expression(`coalesce([P], [Q], [R])`).segments).toEqual([]);
      expect(expression(`notNull([A])`).segments).toEqual([]);
      expect(expression(`notEmpty([A])`).segments).toEqual([]);
    });

    it("should resolve fields correctly", () => {
      expect(expression(`trim([A])`).fields).toEqual([`A`]);
      expect(expression(`round([B])`).fields).toEqual(["B"]);
      expect(expression(`concat([S])`).fields).toEqual(["S"]);
      expect(expression(`concat([A], [B])`).fields).toEqual(["A", "B"]);
      expect(expression(`coalesce([P])`).fields).toEqual(["P"]);
      expect(expression(`coalesce([P], [Q], [R])`).fields).toEqual([
        "P",
        "Q",
        "R",
      ]);
      expect(expression(`in([A], [B], [C])`).fields).toEqual(["A", "B", "C"]);
      expect(expression(`text([A])`).fields).toEqual(["A"]);
      expect(expression(`integer([A])`).fields).toEqual(["A"]);
      expect(expression(`doesNotContain([A], "SomeString")`).fields).toEqual([
        "A",
      ]);
      expect(expression(`notNull([A])`).fields).toEqual(["A"]);
      expect(expression(`notEmpty([A])`).fields).toEqual(["A"]);
    });

    it("should allow nested datetime expressions", () => {
      expect(() => expression(`year(now)`)).not.toThrow();
    });

    describe("datetime functions", () => {
      it("should resolve unchained functions", () => {
        expect(() => expression(`week("2022-01-01")`)).not.toThrow();
        expect(() =>
          expression(`datetimeAdd("2022-01-01", 1, "month")`),
        ).not.toThrow();

        // TODO: Implementation should be fine-tuned so that these throw
        // as they are not really datetime
        expect(() => expression(`day([A])`)).not.toThrow();
        expect(() => expression(`day("a")`)).not.toThrow();
        expect(() => expression(`weekday([A])`)).not.toThrow();
        expect(() => expression(`weekday("a")`)).not.toThrow();
        expect(() => expression(`week([A])`)).not.toThrow();
        expect(() => expression(`week("a")`)).not.toThrow();
        expect(() => expression(`month([A])`)).not.toThrow();
        expect(() => expression(`month("a")`)).not.toThrow();
        expect(() => expression(`quarter([A])`)).not.toThrow();
        expect(() => expression(`quarter("a")`)).not.toThrow();
        expect(() => expression(`year([A])`)).not.toThrow();
        expect(() => expression(`year("a")`)).not.toThrow();
      });

      it("should resolve chained commands", () => {
        expect(() =>
          expression(
            `datetimeSubtract(datetimeAdd("2022-01-01", 1, "month"), 2,"minute")`,
          ),
        ).not.toThrow();
      });

      it("should chain datetime functions onto functions of compatible types", () => {
        expect(() =>
          expression(
            `concat(datetimeAdd("2022-01-01", 1, "month"), "a string")`,
          ),
        ).not.toThrow();
      });
    });
  });

  describe("for aggregations", () => {
    it("should resolve fields correctly", () => {
      expect(aggregation(`[A]`).fields).toEqual([]);
      expect(aggregation(`CumulativeSum([B])`).fields).toEqual(["B"]);
      expect(aggregation(`5 - Average([C])`).fields).toEqual(["C"]);
      expect(aggregation(`Share([P] > 3)`).fields).toEqual(["P"]);
      expect(aggregation(`Max(4 * [Q])`).fields).toEqual(["Q"]);
      expect(aggregation(`[R] + Median([S])`).fields).toEqual(["S"]);
      expect(aggregation(`CountIf(notNull([A]))`).fields).toEqual(["A"]);
      expect(aggregation(`CountIf(notEmpty([A]))`).fields).toEqual(["A"]);
    });

    it("should resolve metrics correctly", () => {
      expect(aggregation(`[A]`).metrics).toEqual(["A"]);
      expect(aggregation(`CumulativeSum([B])`).metrics).toEqual([]);
      expect(aggregation(`5 - Average([C])`).metrics).toEqual([]);
      expect(aggregation(`Share([P] > 3)`).metrics).toEqual([]);
      expect(aggregation(`Max(4 * [Q])`).metrics).toEqual([]);
      expect(aggregation(`[R] + Median([S])`).metrics).toEqual(["R"]);
      expect(aggregation(`CountIf(notNull([A]))`).metrics).toEqual([]);
      expect(aggregation(`CountIf(notEmpty([A]))`).metrics).toEqual([]);
    });

    it("should accept PERCENTILE with two arguments", () => {
      expect(() => aggregation(`Percentile([A], 0.5)`)).not.toThrow();
    });

    it("should handle Distinct/Min/Max aggregating over non-numbers", () => {
      expect(() => aggregation(`Distinct(coalesce("F"))`)).not.toThrow();
      expect(() => aggregation(`Min(coalesce("F"))`)).not.toThrow();
      expect(() => aggregation(`Max(coalesce("F"))`)).not.toThrow();
    });
  });

  describe("for CASE expressions", () => {
    it("should handle CASE with two arguments", () => {
      expect(expression(`case([A], [B])`)).toEqual({
        fields: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with three arguments", () => {
      expect(expression(`case([P], [Q], [R])`)).toEqual({
        fields: ["Q", "R"],
        segments: ["P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with four arguments", () => {
      expect(expression(`case([A], [B], [P], [Q])`)).toEqual({
        fields: ["B", "Q"],
        segments: ["A", "P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with five arguments", () => {
      expect(expression(`case([A], [B], [P], [Q], [R])`)).toEqual({
        fields: ["B", "Q", "R"],
        segments: ["A", "P"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE with two complex arguments", () => {
      expect(expression(`case([P] < 2, [Q])`)).toEqual({
        fields: ["P", "Q"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle nested CASE", () => {
      expect(expression(`case([P], [Q], case([A], [B]))`)).toEqual({
        fields: ["Q", "B"],
        segments: ["P", "A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should handle CASE inside COALESCE", () => {
      expect(expression(`coalesce(case([A], [B]))`)).toEqual({
        fields: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should accept a CASE expression with complex arguments", () => {
      expect(() => expression(`case([X], 0.5 * [Y], [A] - [B])`)).not.toThrow();
    });

    it("should allow sum inside expression in aggregation", () => {
      expect(() => expression(`case(Sum([A] > 10), [B])`)).not.toThrow();
    });

    it("should accept IF as an alias for CASE", () => {
      expect(expression(`if([A], [B])`)).toEqual({
        fields: ["B"],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should not fail on literal 0", () => {
      expect(expression(`case([A], 0)`).expression).toEqual({
        operator: "case",
        options: {},
        args: [expect.any(Object), 0],
      });

      expect(expression(`case([A], 0, 0)`).expression).toEqual({
        operator: "case",
        options: {},
        args: [expect.any(Object), 0, 0],
      });
    });
  });

  it("should reject unknown function", () => {
    expect(() => expression(`foobar(42)`)).toThrow();
  });

  describe("coalesce", () => {
    it("should resolve coalesce correctly", () => {
      expect(expression(`coalesce([A])`)).toEqual({
        fields: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
      expect(filter(`coalesce([A])`)).toEqual({
        fields: [],
        segments: ["A"],
        metrics: [],
        expression: expect.any(Object),
      });
      expect(aggregation(`coalesce([A])`)).toEqual({
        fields: [],
        segments: [],
        metrics: ["A"],
        expression: expect.any(Object),
      });
      expect(aggregation(`trim(coalesce([A]))`)).toEqual({
        fields: ["A"],
        segments: [],
        metrics: [],
        expression: expect.any(Object),
      });
    });

    it("should accept COALESCE for number", () => {
      expect(() => expression(`round(coalesce(0))`)).not.toThrow();
    });

    it("should accept COALESCE for string", () => {
      expect(() => expression(`trim(coalesce("B"))`)).not.toThrow();
    });

    it("should honor CONCAT's implicit casting", () => {
      expect(() => expression(`concat(coalesce("B"), 1)`)).not.toThrow();
    });
  });

  describe("comparison operators", () => {
    const operators = ["<", "<=", ">", ">="] as const;
    operators.forEach((operator) => {
      it(`should resolve both args to ${operator}`, () => {
        const source = `[A] ${operator} [B]`;
        expect(expression(source).fields).toEqual(["A", "B"]);
        expect(filter(source).fields).toEqual(["A", "B"]);
        expect(aggregation(source).fields).toEqual(["A", "B"]);
        expect(aggregation(`CountIf(${source})`).fields).toEqual(["A", "B"]);
      });
    });
  });

  describe("number operators", () => {
    const operators = ["+", "-", "*", "/"] as const;
    operators.forEach((operator) => {
      it(`should resolve all ${operator} args correctly`, () => {
        const source = `[A] ${operator} [B] ${operator} [C]`;
        expect(expression(source)).toEqual({
          fields: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Object),
        });
        expect(filter(source)).toEqual({
          fields: ["A", "B", "C"],
          segments: [],
          metrics: [],
          expression: expect.any(Object),
        });
        expect(aggregation(source)).toEqual({
          fields: [],
          segments: [],
          metrics: ["A", "B", "C"],
          expression: expect.any(Object),
        });
      });
    });
  });

  describe("logic operators", () => {
    const operators = ["and", "or"] as const;
    operators.forEach((operator) => {
      it(`should resolve all args to ${operator} correctly`, () => {
        const source = `[A] ${operator} [B] ${operator} [C]`;
        expect(expression(source)).toEqual({
          fields: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
        expect(filter(source)).toEqual({
          fields: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
        expect(aggregation(source)).toEqual({
          fields: [],
          metrics: [],
          segments: ["A", "B", "C"],
          expression: expect.any(Object),
        });
      });
    });

    it("should resolve not args correctly", () => {
      const source = `not [A]`;
      expect(expression(source)).toEqual({
        fields: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
      expect(filter(source)).toEqual({
        fields: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
      expect(aggregation(source)).toEqual({
        fields: [],
        metrics: [],
        segments: ["A"],
        expression: expect.any(Object),
      });
    });
  });
});
