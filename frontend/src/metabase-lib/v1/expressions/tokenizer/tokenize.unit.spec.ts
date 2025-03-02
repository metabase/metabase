import { OPERATOR, TOKEN } from "../tokenizer";

import { tokenize } from "./tokenize";

describe("tokenizer", () => {
  describe("expressions", () => {
    it("tokenizes valid expression", () => {
      const { tokens, errors } = tokenize(
        'case([Total] > 200, [T], "Nothing")',
      );

      expect(errors).toHaveLength(0);
      expect(tokens).toEqual([
        { type: TOKEN.Identifier, start: 0, end: 4, isReference: false }, // case
        { type: TOKEN.Operator, op: "(", start: 4, end: 5 }, // (
        { type: TOKEN.Identifier, start: 5, end: 12, isReference: true }, // [Total]
        { type: TOKEN.Operator, op: ">", start: 13, end: 14 }, // >
        { type: TOKEN.Number, start: 15, end: 18 }, // 200
        { type: TOKEN.Operator, op: ",", start: 18, end: 19 }, // ,
        { type: TOKEN.Identifier, start: 20, end: 23, isReference: true }, // [T]
        { type: TOKEN.Operator, op: ",", start: 23, end: 24 }, // ,
        { type: TOKEN.String, start: 25, end: 34, value: "Nothing" }, // "Nothing"
        { type: TOKEN.Operator, op: ")", start: 34, end: 35 }, // )
      ]);
    });

    it("should tokenize simple comparisons", () => {
      {
        const expression = "[Total] < 0";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, isReference: true, start: 0, end: 7 },
          { type: TOKEN.Operator, op: "<", start: 8, end: 9 },
          { type: TOKEN.Number, start: 10, end: 11 },
        ]);
      }

      {
        const expression = "[Rate] >= 0";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, isReference: true, start: 0, end: 6 },
          { type: TOKEN.Operator, op: ">=", start: 7, end: 9 },
          { type: TOKEN.Number, start: 10, end: 11 },
        ]);
      }

      {
        const expression = "NOT [Deal]";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Operator, op: "not", start: 0, end: 3 },
          { type: TOKEN.Identifier, isReference: true, start: 4, end: 10 },
        ]);
      }

      {
        const expression = "- Min(5, 10)";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Operator, op: "-", start: 0, end: 1 },
          { type: TOKEN.Identifier, isReference: false, start: 2, end: 5 },
          { type: TOKEN.Operator, op: "(", start: 5, end: 6 },
          { type: TOKEN.Number, start: 6, end: 7 },
          { type: TOKEN.Operator, op: ",", start: 7, end: 8 },
          { type: TOKEN.Number, start: 9, end: 11 },
          { type: TOKEN.Operator, op: ")", start: 11, end: 12 },
        ]);
      }

      {
        const expression = "[X]+[Y]";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, isReference: true, start: 0, end: 3 },
          { type: TOKEN.Operator, op: "+", start: 3, end: 4 },
          { type: TOKEN.Identifier, isReference: true, start: 4, end: 7 },
        ]);
      }

      {
        const expression = "[P]/[Q]";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, isReference: true, start: 0, end: 3 },
          { type: TOKEN.Operator, op: "/", start: 3, end: 4 },
          { type: TOKEN.Identifier, isReference: true, start: 4, end: 7 },
        ]);
      }

      {
        const expression = "TODAY()";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, isReference: false, start: 0, end: 5 },
          { type: TOKEN.Operator, op: "(", start: 5, end: 6 },
          { type: TOKEN.Operator, op: ")", start: 6, end: 7 },
        ]);
      }

      {
        const expression = "AVG([Tax])";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, isReference: false, start: 0, end: 3 },
          { type: TOKEN.Operator, op: "(", start: 3, end: 4 },
          { type: TOKEN.Identifier, isReference: true, start: 4, end: 9 },
          { type: TOKEN.Operator, op: ")", start: 9, end: 10 },
        ]);
      }

      {
        const expression = "COUNTIF([Discount] < 5)";
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, isReference: false, start: 0, end: 7 },
          { type: TOKEN.Operator, op: "(", start: 7, end: 8 },
          { type: TOKEN.Identifier, isReference: true, start: 8, end: 18 },
          { type: TOKEN.Operator, op: "<", start: 19, end: 20 },
          { type: TOKEN.Number, start: 21, end: 22 },
          { type: TOKEN.Operator, op: ")", start: 22, end: 23 },
        ]);
      }
    });
  });

  describe("invalid characters", () => {
    it("handles invalid characters", () => {
      const { tokens, errors } = tokenize("10°");
      expect(tokens).toEqual([
        {
          type: TOKEN.Number,
          start: 0,
          end: 2,
        },
      ]);
      expect(errors).toEqual([
        {
          message: "Invalid character: °",
          len: 1,
          pos: 2,
        },
      ]);
    });

    it("should catch a lone decimal point", () => {
      const { tokens, errors } = tokenize(".");
      expect(tokens).toHaveLength(0);
      expect(errors).toEqual([
        {
          message: "Invalid character: .",
          pos: 0,
          len: 1,
        },
      ]);
    });
  });

  describe("numbers", () => {
    it("tokenizes numbers correctly", () => {
      const cases = [
        "1",
        "1e2",
        "1E2",
        "1e-2",
        "1E-2",
        ".1e2",
        ".1E2",
        ".1e-2",
        ".1E-2",
        "1.2",
        "1.2e3",
        "1.2E3",
        "1.2e-3",
        "1.2E-3",
        "1.2e03",
        "1.2E03",
        "1.2e-03",
        "1.2E-03",
        ".2e3",
        ".2E3",
        ".2e-3",
        ".2E-3",
        ".1",
        ".1e2",
        "1e99999",
        "1E99999",
        ".1e99999",
        ".1E99999",
        "1e-99999",
        "1E-99999",
        ".1e-99999",
        ".1E-99999",
        ".0",
        ".5",
        "9.",
        "42",
        "0",
        "123456789",
        "3.14",
        "2.7182818284590452353602874",
        "6.022E+23",
        "6.626e-34",
        "299.792458e6",
        "9.e0",
      ];

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Number,
            start: 0,
            end: expression.length,
          },
        ]);
      }
    });

    it("handles malformed exponents in mathematical notation", () => {
      const cases = [
        "1E",
        "1e",
        "1.2E",
        "1.2e",
        "1E+",
        "1e+",
        "1.2E+",
        "1.2e+",
        "1E-",
        "1e-",
        "1.2E-",
        "1.2e-",
        "1.2e-",
        ".1E",
        ".1e",
        ".1E+",
        ".1e+",
        ".1E-",
        ".1e-",
        ".1E-",
        "2e",
        "3e+",
        "4E-",
        "4E-",
      ];

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(tokens).toEqual([
          {
            type: TOKEN.Number,
            start: 0,
            end: expression.length,
          },
        ]);
        expect(errors).toEqual([
          {
            message: "Missing exponent",
            pos: 0,
            len: expect.any(Number),
          },
        ]);
      }
    });
  });

  describe("whitespace", () => {
    it("ignores whitespace", () => {
      const cases = [
        0x0009, // tab
        0x000a, // line feed
        0x000b, // vertical tab
        0x000c, // form feed
        0x000d, // carriage return
        0x0020, // space
        0x0085, // next line
        0x00a0, // non-breaking space
        0x1680, // ogham space
        0x2000, // en quad
        0x2001, // em quad
        0x2002, // en space
        0x2003, // em space
        0x2004, // third em space
        0x2005, // fourth em space
        0x2006, // sixth em space
        0x2007, // figure space
        0x2008, // punctuation space
        0x2009, // thin space
        0x200a, // hair space
        0x2028, // line separator
        0x2029, // paragraph separator
        0x202f, // no break narrow space
        0x205f, // four-eighteenths em space
        0x3000, // cjk language space
      ];

      for (const whitespace of cases) {
        const ws = String.fromCharCode(whitespace);
        const { tokens, errors } = tokenize(`a${ws}b`);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          { type: TOKEN.Identifier, start: 0, end: 1, isReference: false },
          { type: TOKEN.Identifier, start: 2, end: 3, isReference: false },
        ]);
      }
    });
  });

  describe("strings", () => {
    it("tokenizes strings", () => {
      const cases = [
        [`"foo"`, "foo"],
        [`'foo'`, "foo"],
        [`"foo bar"`, "foo bar"],
        [`'foo bar'`, "foo bar"],
        [`"foo'"`, "foo'"],
        [`'foo"'`, 'foo"'],
        [`"'foo"`, "'foo"],
        [`'"foo'`, '"foo'],
        [`"'foo'"`, "'foo'"],
        [`'"foo"'`, '"foo"'],
        [`"foo\\""`, 'foo"'],
        [`'foo\\''`, "foo'"],
        [`"foo\\bbar"`, "foo\bbar"],
        [`'foo\\bbar'`, "foo\bbar"],
        [`"foo\\fbar"`, "foo\fbar"],
        [`'foo\\fbar'`, "foo\fbar"],
        [`"foo\\nbar"`, "foo\nbar"],
        [`'foo\\nbar'`, "foo\nbar"],
        [`"foo\\rbar"`, "foo\rbar"],
        [`'foo\\rbar'`, "foo\rbar"],
        [`"foo\\tbar"`, "foo\tbar"],
        [`'foo\\tbar'`, "foo\tbar"],
        [`"foo\\vbar"`, "foo\x0bbar"],
        [`'foo\\vbar'`, "foo\x0bbar"],
        [`"foo\\"bar"`, 'foo"bar'],
        [`'foo\\'bar'`, "foo'bar"],
        ['"\\n"', "\n"],
        ['"\\r\\n"', "\r\n"],
        ['"say \\"Hi\\""', 'say "Hi"'],
        ["'foo\\tbar'", "foo\tbar"],
      ];

      for (const [expression, value] of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.String,
            start: 0,
            end: expression.length,
            value,
          },
        ]);
      }
    });

    it("handles invalid escape sequences", () => {
      const cases = [
        ["'\\x22'", "x22"],
        ["'\\wat'", "wat"],
      ];

      for (const [expression, value] of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.String,
            start: 0,
            end: expression.length,
            value,
          },
        ]);
      }
    });

    it("handles unbalanced strings", () => {
      const cases = [`"single`, `'double`, `"foo\\"`, `'foo\\'`];

      for (const expression of cases) {
        const { errors } = tokenize(expression);
        expect(errors).toEqual([
          { message: "Missing closing quotes", pos: 0, len: expression.length },
        ]);
      }
    });

    it("should continue to tokenize when encountering an unterminated string literal", () => {
      const { tokens, errors } = tokenize(`CONCAT(universe') = [answer]`);
      expect(errors).toEqual([
        {
          len: 13,
          message: "Missing closing quotes",
          pos: 15,
        },
      ]);
      expect(tokens).toEqual([
        {
          type: TOKEN.Identifier,
          isReference: false,
          start: 0,
          end: 6,
        },
        {
          type: TOKEN.Operator,
          op: "(",
          start: 6,
          end: 7,
        },
        {
          type: TOKEN.Identifier,
          isReference: false,
          start: 7,
          end: 15,
        },
        {
          type: TOKEN.String,
          value: ") = [answer",
          start: 15,
          end: 28,
        },
      ]);
    });
  });

  describe("identifiers", () => {
    it("tokenizes identifiers", () => {
      const cases = [
        "foo",
        "foo_bar",
        "foo.bar",
        "notnull", // should handle other operators as prefix
        "trueish",
        "notable",
        "ANDRA",
        "Oracle",
        "Price",
        "Special_Deal",
        "Product.Rating",
        "_Category",
      ];

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Identifier,
            start: 0,
            end: expression.length,
            isReference: false,
          },
        ]);
      }
    });
  });

  describe("bracket identifiers", () => {
    it("tokenizes bracket identifiers", () => {
      const cases = [
        "[foo]",
        "[foo bar]",
        "[foo bar bar]",
        '[foo " bar]',
        "[foo ' bar]",
        "[foo ` bar]",
        "[foo ° bar]",
        "[foo , bar]",
        "[Deal]",
        "[Review → Rating]",
        "[Product.Vendor]",
      ];

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Identifier,
            start: 0,
            end: expression.length,
            isReference: true,
          },
        ]);
      }
    });

    it("handles brackets that aren't properly closed", () => {
      const { tokens, errors } = tokenize("[foo");
      expect(tokens).toEqual([
        {
          type: TOKEN.Identifier,
          start: 0,
          end: 4,
          isReference: true,
        },
      ]);
      expect(errors).toEqual([
        {
          message: "Missing a closing bracket",
          pos: 0,
          len: 4,
        },
      ]);
    });

    it("handles brackets that aren't properly closed (multiple open brackets)", () => {
      const { tokens, errors } = tokenize("[T[");
      expect(tokens).toEqual([
        {
          type: TOKEN.Identifier,
          start: 0,
          end: 2,
          isReference: true,
        },
      ]);
      expect(errors).toEqual([
        {
          message: "Missing a closing bracket",
          pos: 0,
          len: 2,
        },
        {
          message: "Invalid character: [",
          len: 1,
          pos: 2,
        },
      ]);
    });

    it("should allow escaping brackets within bracket identifiers", () => {
      const cases = ["[T\\[]", "[T\\]]", "[T\\[A\\]]"];
      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Identifier,
            isReference: true,
            start: 0,
            end: expression.length,
          },
        ]);
      }
    });

    it("should catch a dangling closing bracket", () => {
      const { errors } = tokenize("floor(Total]*1.25)");
      expect(errors).toEqual([
        {
          message: "Missing an opening bracket for Total",
          pos: 11,
          len: 1,
        },
      ]);
    });

    it("handles brackets that aren't properly opened", () => {
      const { tokens, errors } = tokenize("foo]");
      expect(tokens).toEqual([
        {
          type: TOKEN.Identifier,
          start: 0,
          end: 3,
          isReference: false,
        },
      ]);
      expect(errors).toEqual([
        {
          message: "Missing an opening bracket for foo",
          pos: 3,
          len: 1,
        },
      ]);
    });

    it("takes operators into account when dealing with incomplete bracket identifier tokens", () => {
      const { tokens, errors } = tokenize(
        'case([Total] > 200, [To, "Nothing")',
      );

      expect(tokens).toEqual([
        { type: TOKEN.Identifier, start: 0, end: 4, isReference: false }, // case
        { type: TOKEN.Operator, op: "(", start: 4, end: 5 }, // (
        { type: TOKEN.Identifier, start: 5, end: 12, isReference: true }, // [Total]
        { type: TOKEN.Operator, op: ">", start: 13, end: 14 }, // >
        { type: TOKEN.Number, start: 15, end: 18 }, // 200
        { type: TOKEN.Operator, op: ",", start: 18, end: 19 }, // ,
        { type: TOKEN.Identifier, start: 20, end: 23, isReference: true }, // [To <-- that's the incomplete token
        { type: TOKEN.Operator, op: ",", start: 23, end: 24 }, // ,
        { type: TOKEN.String, start: 25, end: 34, value: "Nothing" }, // "Nothing"
        { type: TOKEN.Operator, op: ")", start: 34, end: 35 }, // )
      ]);
      expect(errors).toEqual([
        {
          message: "Missing a closing bracket",
          pos: 20,
          len: 3,
        },
      ]);
    });

    it("tokenizes empty identifier brackets", () => {
      const { tokens, errors } = tokenize("[]");
      expect(errors).toHaveLength(0);
      expect(tokens).toEqual([
        {
          type: TOKEN.Identifier,
          start: 0,
          end: 2,
          isReference: true,
        },
      ]);
    });

    it("tokenizes consecutive bracket identifiers", () => {
      const { tokens, errors } = tokenize("[Foo] [Bar]");
      expect(errors).toHaveLength(0);
      expect(tokens).toEqual([
        {
          type: TOKEN.Identifier,
          start: 0,
          end: 5,
          isReference: true,
        },
        {
          type: TOKEN.Identifier,
          start: 6,
          end: 11,
          isReference: true,
        },
      ]);
    });

    it("tokenizes incomplete bracket identifier followed by whitespace (metabase#50925)", () => {
      const { tokens, errors } = tokenize("[Pr [Price]");
      expect(tokens).toEqual([
        {
          // [Pr
          type: TOKEN.Identifier,
          start: 0,
          end: 4,
          isReference: true,
        },
        {
          // [Price]
          type: TOKEN.Identifier,
          start: 4,
          end: 11,
          isReference: true,
        },
      ]);
      expect(errors).toEqual([
        {
          message: "Missing a closing bracket",
          pos: 0,
          len: expect.any(Number),
        },
      ]);
      expect(errors[0].len).toBeGreaterThanOrEqual(3);
      expect(errors[0].len).toBeLessThanOrEqual(4);
    });

    it("tokenizes incomplete bracket identifier followed by bracket identifier (metabase#50925)", () => {
      const { tokens, errors } = tokenize("[Pr[Price]");
      expect(tokens).toEqual([
        {
          // [Pr
          type: TOKEN.Identifier,
          start: 0,
          end: 3,
          isReference: true,
        },
        {
          // [Price]
          type: TOKEN.Identifier,
          start: 3,
          end: 10,
          isReference: true,
        },
      ]);
      expect(errors).toEqual([
        {
          message: "Missing a closing bracket",
          pos: 0,
          len: expect.any(Number),
        },
      ]);
    });
  });

  describe("operators", () => {
    it("tokenizes operators", () => {
      const cases = [
        "+",
        "-",
        "*",
        "/",
        "=",
        "!=",
        "<",
        "<=",
        ">",
        ">=",
        ",",
        "(",
        ")",
      ];

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Operator,
            start: 0,
            end: expression.length,
            op: expression,
          },
        ]);
      }
    });

    it("tokenizes boolean operators", () => {
      const cases: [string, string, number][] = [
        ["A or B", OPERATOR.Or, 1],
        ["A and B", OPERATOR.And, 1],
        ["not A", OPERATOR.Not, 0],
      ];

      const permutations = cases.flatMap(
        ([expression, token, index]: [string, string, number]) =>
          casePermutations(expression).map((str): [string, string, number] => [
            str,
            token,
            index,
          ]),
      );

      for (const [expression, op, index] of permutations) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens[index]).toEqual({
          type: TOKEN.Operator,
          op,
          start: expect.any(Number),
          end: expect.any(Number),
        });
      }
    });
  });

  describe("booleans", () => {
    it("tokenizes booleans correctly", () => {
      const cases = ["true", "false"].flatMap(casePermutations);

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Boolean,
            start: 0,
            end: expression.length,
            op: expression.toLowerCase(),
          },
        ]);
      }
    });
  });

  describe("garbage", () => {
    const types = (expr: string) => tokenize(expr).tokens.map(t => t.type);
    const errors = (expr: string) => tokenize(expr).errors;

    // This is hard to manage with the lezer parser
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should ignore garbage", () => {
      expect(types("!@^ [Deal]")).toEqual([TOKEN.Identifier]);
      expect(errors("!")[0].message).toEqual("Invalid character: !");
      expect(errors(" % @")[1].message).toEqual("Invalid character: @");
      expect(errors("    #")[0].pos).toEqual(4);
      expect(errors("    #")[0].len).toEqual(1);
    });
  });
});

/**
 * Takes a string and returns a list of all possible cases of the string.
 *
 * @example
 *   casePermutations("AB") // ["AB", "aB", "Ab", "ab"]
 */
function casePermutations(str: string): string[] {
  let results = [""];

  for (const char of str) {
    const newResults = [];
    for (const perm of results) {
      newResults.push(perm + char.toLowerCase());
      newResults.push(perm + char.toUpperCase());
    }
    results = newResults;
  }

  return results;
}
