import { compile } from "./common";

describe("pratt/compiler", () => {
  function expr(
    source: string,
    opts: {
      throwOnError?: boolean;
      resolverPass?: boolean;
      type?: "expression" | "boolean";
    } = {},
  ) {
    const { throwOnError = true, type = "expression", resolverPass } = opts;
    return compile(source, type, { throwOnError, resolverPass });
  }

  describe("(for an expression)", () => {
    it("should compile literals", () => {
      expect(expr("42")).toEqual(42);
      expect(expr("'Universe'")).toEqual("Universe");
    });

    /// TODO: Fix w/ some type info
    it("should compile dimensions", () => {
      expect(expr("[Price]")).toEqual(["dimension", "Price"]);
      expect(expr("([X])")).toEqual(["dimension", "X"]);
    });

    it("should compile arithmetic operations", () => {
      expect(expr("1+2")).toEqual(["+", 1, 2]);
      expect(expr("3-4")).toEqual(["-", 3, 4]);
      expect(expr("5*6")).toEqual(["*", 5, 6]);
      expect(expr("7/8")).toEqual(["/", 7, 8]);
      expect(expr("-(1+2)")).toEqual(["-", ["+", 1, 2]]);
    });

    it("should compile comparisons", () => {
      expect(expr("1<2")).toEqual(["<", 1, 2]);
      expect(expr("3>4")).toEqual([">", 3, 4]);
      expect(expr("5<=6")).toEqual(["<=", 5, 6]);
      expect(expr("7>=8")).toEqual([">=", 7, 8]);
      expect(expr("9=9")).toEqual(["=", 9, 9]);
      expect(expr("9!=0")).toEqual(["!=", 9, 0]);
    });

    it("should logical operators", () => {
      expect(expr("7 or 8")).toEqual(["or", 7, 8]);
      expect(expr("7 and 8")).toEqual(["and", 7, 8]);
      expect(expr("7 and Size")).toEqual(["and", 7, ["dimension", "Size"]]);
      expect(expr("NOT (7 and Size)")).toEqual([
        "not",
        ["and", 7, ["dimension", "Size"]],
      ]);
    });

    it("should handle parenthesized expression", () => {
      expect(expr("(42)")).toEqual(42);
      expect(expr("-42")).toEqual(-42);
      expect(expr("-(42)")).toEqual(["-", 42]);
      expect(expr("((43))")).toEqual(43);
      expect(expr("('Universe')")).toEqual("Universe");
      expect(expr("(('Answer'))")).toEqual("Answer");
      expect(expr("(1+2)")).toEqual(["+", 1, 2]);
      expect(expr("(1+2)/3")).toEqual(["/", ["+", 1, 2], 3]);
      expect(expr("4-(5*6)")).toEqual(["-", 4, ["*", 5, 6]]);
      expect(expr("func_name(5*6, 4-3)")).toEqual([
        "func_name",
        ["*", 5, 6],
        ["-", 4, 3],
      ]);
    });
  });

  describe("Should match the old compiler", () => {
    it("Seed 59793: NOT NOT [p]<0", () => {
      expect(expr("NOT NOT [p] < 0")).toEqual([
        "not",
        ["not", ["<", ["dimension", "p"], 0]],
      ]);
    });

    it("Seed 59809: NOT ( ( [gG9_r]) )  >=( [__] )", () => {
      expect(expr("NOT ( ( [gG9_r]) )  >=( [__] )")).toEqual([
        "not",
        [">=", ["dimension", "gG9_r"], ["dimension", "__"]],
      ]);
    });

    // note, changed from original to accommodate validation of substring args
    it(`Seed 10099: CONtAinS ( [OF4wuV], SUbstriNG("_", 1, lENGtH("s Mfg7" ) ) )`, () => {
      const compiled = expr(
        `CONtAinS ( [OF4wuV], SUbstriNG("_", 1, lENGtH("s Mfg7" ) ) )`,
        { throwOnError: true, resolverPass: false, type: "boolean" },
      );
      expect(compiled).toEqual([
        "contains",
        ["dimension", "OF4wuV"],
        ["substring", "_", 1, ["length", "s Mfg7"]],
      ]);
    });

    it(`Seed 10092:  NOT ( NOT   (isNUll ([T0q → n_M_O])))`, () => {
      const compiled = expr(` NOT ( NOT   (isNUll ([T0q → n_M_O])))`, {
        throwOnError: true,
        resolverPass: false,
      });
      expect(compiled).toEqual([
        "not",
        ["not", ["is-null", ["dimension", "T0q → n_M_O"]]],
      ]);
    });

    it(`Seed 10082: SUbstriNg( cOncat("BaK2    ", [__m_4], rTrim(coNcAt (replACE ([Av5Wtbz], regeXextRACt( [_1I → g], "H NVB84_"), rEGexextract ( [__8], " _ 2" )  ) , SUbStRiNG("qb0  ", (power( LeNgTh ( rtrim ( "YyCe_2" )) * 0e+77, 1 ) ), 1 + 0e-54 / 374719e-64) , cOncaT( "    F9 _O", "_a5_", " 5 _U_ ", " bE", rEPlACe (BXj3O, " ", [Z → X9]) ) )  )  ), (1), log ( 1E-26 )  )`, () => {
      const compiled = expr(
        `SUbstriNg( cOncat("BaK2    ", [__m_4], rTrim(coNcAt (replACE ([Av5Wtbz], regeXextRACt( [_1I → g], "H NVB84_"), rEGexextract ( [__8], " _ 2" )  ) , SUbStRiNG("qb0  ", (power( LeNgTh ( rtrim ( "YyCe_2" )) * 0e+77, 1 ) ), 1 + 0e-54 / 374719e-64) , cOncaT( "    F9 _O", "_a5_", " 5 _U_ ", " bE", rEPlACe (BXj3O, " ", [Z → X9]) ) )  )  ), (1), log ( 1E-26 )  )`,
        { throwOnError: true, resolverPass: false },
      );
      expect(compiled).toEqual([
        "substring",
        [
          "concat",
          "BaK2    ",
          ["dimension", "__m_4"],
          [
            "rtrim",
            [
              "concat",
              [
                "replace",
                ["dimension", "Av5Wtbz"],
                ["regex-match-first", ["dimension", "_1I → g"], "H NVB84_"],
                ["regex-match-first", ["dimension", "__8"], " _ 2"],
              ],
              [
                "substring",
                "qb0  ",
                ["power", ["*", ["length", ["rtrim", "YyCe_2"]], 0], 1],
                ["+", 1, ["/", 0, 3.74719e-59]],
              ],
              [
                "concat",
                "    F9 _O",
                "_a5_",
                " 5 _U_ ",
                " bE",
                [
                  "replace",
                  ["dimension", "BXj3O"],
                  " ",
                  ["dimension", "Z → X9"],
                ],
              ],
            ],
          ],
        ],
        1,
        ["log", 1e-26],
      ]);
    });

    it(`Seed 57808:  (( Abs (  (exP( cEil(  - 1e+48) )) )  * -1e31 ) * ( poWeR( (( - 0e+67) *lengTh ( "8" )  ) ,  ( -1 ) *lengTh( "Q  P2c n" ) / powEr(1, N) ) )  )`, () => {
      const compiled = expr(
        `(( Abs (  (exP( cEil(  - 1e+48) )) )  * -1e31 ) * ( poWeR( (( - 0e+67) *lengTh ( "8" )  ) ,  ( -1 ) *lengTh( "Q  P2c n" ) / powEr(1, N) ) )  )`,
        { throwOnError: true, resolverPass: false },
      );
      expect(compiled).toEqual([
        "*",
        ["abs", ["exp", ["ceil", -1e48]]],
        -1e31,
        [
          "power",
          ["*", -0, ["length", "8"]],
          [
            "/",
            ["*", -1, ["length", "Q  P2c n"]],
            ["power", 1, ["dimension", "N"]],
          ],
        ],
      ]);
    });

    // Checks that `x - (y - z)` doesn't get merged into `x - y -z`
    it(`seed 10144: eNDsWith( "NTP", replacE( [V2FFf → r_8ZFu], coalescE(repLACe([cf → l], sUbStriNg ( Replace( [A], "L ", "b"), coAlEsCE(953925E-38, 307355.510173e+32 ), pOwEr (1e+15, 0 )) , caSe ( IsEMpTy( [_ → _3H_6b]) , cOncat ("n_F e_B n" ) , isEmptY([E → _3R6p6_]), conCat(" D 2h", " 4 9u ", "A_9_M_9_", " q _")) ) , RegExeXtRact ([_PI9], "K43s 6") ) , sUBstriNg (CaSE (intervAl( [_OU9c], - 632269.595767E-79, CoalESce ("u__0_71", "c ")), CoalesCe( suBstriNG ( "XPHC0 li_", 500924.700063e-10, 341369) )), - 1E+47 - (424024.827478-1 ), - 1) ) )`, () => {
      const compiled = expr(
        `(( Abs (  (exP( cEil(  - 1e+48) )) )  * -1e31 ) * ( poWeR( (( - 0e+67) *lengTh ( "8" )  ) ,  ( -1 ) *lengTh( "Q  P2c n" ) / powEr(1, N) ) )  )`,
        { throwOnError: true, resolverPass: false },
      );
      expect(compiled).toEqual([
        "*",
        ["abs", ["exp", ["ceil", -1e48]]],
        -1e31,
        [
          "power",
          ["*", -0, ["length", "8"]],
          [
            "/",
            ["*", -1, ["length", "Q  P2c n"]],
            ["power", 1, ["dimension", "N"]],
          ],
        ],
      ]);
    });

    it(`Merging subtraction`, () => {
      const compiled = expr(`1 - (0 - -10)`, {
        throwOnError: true,
      });
      expect(compiled).toEqual(["-", 1, ["-", 0, -10]]);
    });
  });
});
