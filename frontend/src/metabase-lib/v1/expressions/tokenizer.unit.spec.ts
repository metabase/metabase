import { OPERATOR, TOKEN, tokenize } from "./tokenizer";

describe("tokenizer", () => {
  it("tokenizes valid expression", () => {
    const { tokens, errors } = tokenize('case([Total] > 200, [T], "Nothing")');

    expect(errors).toEqual([]);
    expect(tokens).toEqual([
      { type: TOKEN.Identifier, start: 0, end: 4 }, // case
      { type: TOKEN.Operator, op: "(", start: 4, end: 5 }, // (
      { type: TOKEN.Identifier, start: 5, end: 12 }, // [Total]
      { type: TOKEN.Operator, op: ">", start: 13, end: 14 }, // >
      { type: TOKEN.Number, start: 15, end: 18 }, // 200
      { type: TOKEN.Operator, op: ",", start: 18, end: 19 }, // ,
      { type: TOKEN.Identifier, start: 20, end: 23 }, // [T]
      { type: TOKEN.Operator, op: ",", start: 23, end: 24 }, // ,
      { type: TOKEN.String, start: 25, end: 34, value: "Nothing" }, // "Nothing"
      { type: TOKEN.Operator, op: ")", start: 34, end: 35 }, // )
    ]);
  });

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
          { type: TOKEN.Identifier, start: 0, end: 1 },
          { type: TOKEN.Identifier, start: 2, end: 3 },
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
      const cases = [
        `"foo`,
        `'foo`,
        // `"foo\\"`, // TODO: this case is currently broken
        // `'foo\\'`, // TODO: this case is currently broken
      ];

      for (const expression of cases) {
        const { errors } = tokenize(expression);
        expect(errors).toEqual([
          { message: "Missing closing quotes", pos: 0, len: 1 },
        ]);
      }
    });
  });

  describe("identifiers", () => {
    it("tokenizes identifiers", () => {
      const cases = ["foo", "foo_bar", "foo.bar"];

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Identifier,
            start: 0,
            end: expression.length,
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
        "[foo \n bar]",
      ];

      for (const expression of cases) {
        const { tokens, errors } = tokenize(expression);
        expect(errors).toHaveLength(0);
        expect(tokens).toEqual([
          {
            type: TOKEN.Identifier,
            start: 0,
            end: expression.length,
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

    it("handles brackets that aren't properly opened", () => {
      const { tokens, errors } = tokenize("foo]");
      expect(tokens).toEqual([
        {
          type: TOKEN.Identifier,
          start: 0,
          end: 3,
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
        { type: TOKEN.Identifier, start: 0, end: 4 }, // case
        { type: TOKEN.Operator, op: "(", start: 4, end: 5 }, // (
        { type: TOKEN.Identifier, start: 5, end: 12 }, // [Total]
        { type: TOKEN.Operator, op: ">", start: 13, end: 14 }, // >
        { type: TOKEN.Number, start: 15, end: 18 }, // 200
        { type: TOKEN.Operator, op: ",", start: 18, end: 19 }, // ,
        { type: TOKEN.Identifier, start: 20, end: 23 }, // [To <-- that's the incomplete token
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

    it("tokenizes incomplete bracket identifier followed by whitespace (metabase#50925)", () => {
      const { tokens, errors } = tokenize("[Pr [Price]");
      expect(tokens).toEqual([
        { type: TOKEN.Identifier, start: 0, end: 3 }, // [Pr
        { type: TOKEN.Identifier, start: 4, end: 11 }, // [Price]
      ]);
      expect(errors).toEqual([
        {
          message: "Bracket identifier in another bracket identifier",
          pos: 0,
          len: 3,
        },
      ]);
    });

    it("tokenizes incomplete bracket identifier followed by bracket identifier (metabase#50925)", () => {
      const { tokens } = tokenize("[Pr[Price]");
      expect(tokens).toEqual([
        { type: TOKEN.Identifier, start: 0, end: 3 }, // [Pr
        { type: TOKEN.Identifier, start: 3, end: 10 }, // [Price]
      ]);
    });
  });

  describe("operators", () => {
    it("tokenizes oparators", () => {
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
        "not",
        "and",
        "or",
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

    it("should be case insensitive to operators", () => {
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
