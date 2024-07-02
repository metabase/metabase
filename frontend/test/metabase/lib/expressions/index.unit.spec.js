import { quoteString, unquoteString } from "metabase-lib/v1/expressions";

describe("metabase-lib/v1/expressions", () => {
  // double- and single-quote
  const dq = str => quoteString(str, '"');
  const sq = str => quoteString(str, "'");

  describe("quoteString", () => {
    it("should enclose a string literal with double quotes", () => {
      expect(dq("A")).toEqual('"A"');
      expect(dq("XYZ")).toEqual('"XYZ"');
    });

    it("should enclose a string literal with single quotes", () => {
      expect(sq("B")).toEqual("'B'");
      expect(sq("PQR")).toEqual("'PQR'");
    });

    it("should escape quotes inside the string literal", () => {
      expect(dq('C"D')).toEqual('"C\\"D"');
      expect(sq("E'F")).toEqual("'E\\'F'");
    });

    it("should escape some special characters in a double-quoted string", () => {
      expect(dq("\b")).toEqual('"\\b"');
      expect(dq("Tab: \t")).toEqual('"Tab: \\t"');
      expect(dq("CR: \r")).toEqual('"CR: \\r"');
      expect(dq("LF: \n")).toEqual('"LF: \\n"');
      expect(dq("FF: \f")).toEqual('"FF: \\f"');
      expect(dq("Backslash: \\")).toEqual('"Backslash: \\"');
    });

    it("should escape some special characters in a single-quoted string", () => {
      expect(sq("\b")).toEqual("'\\b'");
      expect(sq("Tab: \t")).toEqual("'Tab: \\t'");
      expect(sq("CR: \r")).toEqual("'CR: \\r'");
      expect(sq("LF: \n")).toEqual("'LF: \\n'");
      expect(sq("FF: \f")).toEqual("'FF: \\f'");
      expect(sq("Backslash: \\")).toEqual("'Backslash: \\'");
    });
  });

  describe("unquoteString", () => {
    it("should handle double-quoted strings", () => {
      expect(unquoteString('"A"')).toEqual("A");
      expect(unquoteString('"PQ"')).toEqual("PQ");
      expect(unquoteString('"XYZ"')).toEqual("XYZ");
      expect(unquoteString('"foo bar"')).toEqual("foo bar");
    });

    it("should handle single-quoted strings", () => {
      expect(unquoteString("'A'")).toEqual("A");
      expect(unquoteString("'PQ'")).toEqual("PQ");
      expect(unquoteString("'XYZ'")).toEqual("XYZ");
      expect(unquoteString("'foo bar'")).toEqual("foo bar");
    });

    it("should perform faithful round-trip operations with double-quoted strings", () => {
      const rt = str => unquoteString(quoteString(str, "'"));
      expect(rt("A")).toEqual("A");
      expect(rt("PQ")).toEqual("PQ");
      expect(rt("XYZ")).toEqual("XYZ");
      expect(rt("foo bar")).toEqual("foo bar");
      expect(rt("\b")).toEqual("\b");
      expect(rt("Tab: \t")).toEqual("Tab: \t");
      expect(rt("CR: \r")).toEqual("CR: \r");
      expect(rt("LF: \n")).toEqual("LF: \n");
      expect(rt("FF: \f")).toEqual("FF: \f");
      expect(rt("Backslash: \\")).toEqual("Backslash: \\");
      expect(rt("\b\t\r\n\f\\").length).toEqual(6);
    });
  });
});
