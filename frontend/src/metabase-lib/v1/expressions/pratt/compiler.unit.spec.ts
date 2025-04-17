import type * as Lib from "metabase-lib";

import { compile, lexify, parse } from ".";

function value(value: unknown, options: Lib.ExpressionOptions = {}) {
  return {
    operator: "value",
    options,
    args: [value],
  };
}

function integer(x: number) {
  return value(x, {
    "base-type": "type/Integer",
    "effective-type": "type/Integer",
  });
}

function text(x: string) {
  return value(x, { "base-type": "type/Text", "effective-type": "type/Text" });
}

describe("pratt/compiler", () => {
  function expr(source: string) {
    const ast = parse(lexify(source).tokens, {
      throwOnError: true,
    });

    return compile(ast.root);
  }

  describe("(for an expression)", () => {
    it("should compile literals", () => {
      expect(expr("42")).toEqual(integer(42));
      expect(expr("'Universe'")).toEqual(text("Universe"));
      expect(expr(`"Universe"`)).toEqual(text("Universe"));
      expect(expr(`"\\""`)).toEqual(text(`"`));
      expect(expr(`'\\''`)).toEqual(text(`'`));
      expect(expr(`"a\\"b"`)).toEqual(text(`a"b`));
      expect(expr(`'a\\'b'`)).toEqual(text(`a'b`));
      expect(expr(`"'"`)).toEqual(text(`'`));
      expect(expr(`'"'`)).toEqual(text(`"`));
    });

    it("should compile bigints", () => {
      expect(expr("12309109320930192039")).toEqual(
        value("12309109320930192039", {
          "base-type": "type/BigInteger",
          "effective-type": "type/BigInteger",
        }),
      );
      expect(expr("-12309109320930192039")).toEqual(
        value("-12309109320930192039", {
          "base-type": "type/BigInteger",
          "effective-type": "type/BigInteger",
        }),
      );

      expect(expr("1 + 12309109320930192039")).toEqual({
        operator: "+",
        options: {},
        args: [
          1,
          value("12309109320930192039", {
            "base-type": "type/BigInteger",
            "effective-type": "type/BigInteger",
          }),
        ],
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
      expect(expr("-12")).toEqual({
        operator: "value",
        options: {
          "base-type": "type/Integer",
          "effective-type": "type/Integer",
        },
        args: [-12],
      });
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
      expect(expr("(42)")).toEqual(integer(42));
      expect(expr("-42")).toEqual(integer(-42));
      expect(expr("-(42)")).toEqual(integer(-42));
      expect(expr("((43))")).toEqual(integer(43));
      expect(expr("('Universe')")).toEqual(text("Universe"));
      expect(expr("(('Answer'))")).toEqual(text("Answer"));
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
