import { quoteString, unquoteString } from "./string";

const dq = (str: string) => quoteString(str, '"');
const sq = (str: string) => quoteString(str, "'");
const bq = (str: string) => quoteString(str, "[");

describe("quoteString", () => {
  describe("single quotes", () => {
    it("should enclose a string literal with single quotes", () => {
      expect(sq(`B`)).toEqual(`'B'`);
      expect(sq(`PQR`)).toEqual(`'PQR'`);
      expect(sq(`\\s`)).toEqual(`'\\s'`);
      expect(sq(`\\\\`)).toEqual(`'\\\\'`);
    });

    it("should escape some special characters in a single-quoted string", () => {
      expect(sq(`\b`)).toEqual(`'\\b'`);
      expect(sq(`Tab: \t`)).toEqual(`'Tab: \\t'`);
      expect(sq(`CR: \r`)).toEqual(`'CR: \\r'`);
      expect(sq(`LF: \n`)).toEqual(`'LF: \\n'`);
      expect(sq(`FF: \f`)).toEqual(`'FF: \\f'`);
      expect(sq(`Backslash: \\\\`)).toEqual(`'Backslash: \\\\'`);
    });

    it("should escape quotes inside the string literal", () => {
      expect(sq(`E'F`)).toEqual(`'E\\'F'`);
      expect(sq(`'foo bar`)).toEqual(`'\\'foo bar'`);
      expect(sq(`foo bar'`)).toEqual(`'foo bar\\''`);
      expect(sq(`'foo bar'`)).toEqual(`'\\'foo bar\\''`);
    });
  });

  describe("double quotes", () => {
    it("should enclose a string literal with double quotes", () => {
      expect(dq(`A`)).toEqual(`"A"`);
      expect(dq(`XYZ`)).toEqual(`"XYZ"`);
      expect(dq(`\\s`)).toEqual(`"\\s"`);
      expect(dq(`\\\\`)).toEqual(`"\\\\"`);
    });

    it("should escape some special characters in a double-quoted string", () => {
      expect(dq(`\b`)).toEqual(`"\\b"`);
      expect(dq(`Tab: \t`)).toEqual(`"Tab: \\t"`);
      expect(dq(`CR: \r`)).toEqual(`"CR: \\r"`);
      expect(dq(`LF: \n`)).toEqual(`"LF: \\n"`);
      expect(dq(`FF: \f`)).toEqual(`"FF: \\f"`);
      expect(dq(`Backslash: \\\\`)).toEqual(`"Backslash: \\\\"`);
    });

    it("should escape quotes inside the string literal", () => {
      expect(dq(`C"D`)).toEqual(`"C\\"D"`);
      expect(dq(`"foo bar`)).toEqual(`"\\"foo bar"`);
      expect(dq(`foo bar"`)).toEqual(`"foo bar\\""`);
      expect(dq(`"foo bar"`)).toEqual(`"\\"foo bar\\""`);
    });
  });

  describe("brackets", () => {
    it("should enclose a string literal with double quotes", () => {
      expect(bq(`A`)).toEqual(`[A]`);
      expect(bq(`XYZ`)).toEqual(`[XYZ]`);
      expect(bq(`\\s`)).toEqual(`[\\s]`);
      expect(bq(`\\\\`)).toEqual(`[\\\\]`);
    });

    it("should escape some special characters in a double-quoted string", () => {
      expect(bq(`\b`)).toEqual(`[\\b]`);
      expect(bq(`Tab: \t`)).toEqual(`[Tab: \\t]`);
      expect(bq(`CR: \r`)).toEqual(`[CR: \\r]`);
      expect(bq(`LF: \n`)).toEqual(`[LF: \\n]`);
      expect(bq(`FF: \f`)).toEqual(`[FF: \\f]`);
      expect(bq(`Backslash: \\\\`)).toEqual(`[Backslash: \\\\]`);
    });

    it("should escape quotes inside the string literal", () => {
      expect(bq(`C[D`)).toEqual(`[C\\[D]`);
      expect(bq(`C]D`)).toEqual(`[C\\]D]`);
      expect(bq(`[foo bar`)).toEqual(`[\\[foo bar]`);
      expect(bq(`foo bar]`)).toEqual(`[foo bar\\]]`);
      expect(bq(`[foo bar]`)).toEqual(`[\\[foo bar\\]]`);
    });
  });
});

describe("unquoteString", () => {
  it("should handle double-quoted strings", () => {
    expect(unquoteString('"A"')).toEqual("A");
    expect(unquoteString('"PQ"')).toEqual("PQ");
    expect(unquoteString('"XYZ"')).toEqual("XYZ");
    expect(unquoteString('"foo bar"')).toEqual("foo bar");
    expect(unquoteString(`"'"`)).toEqual(`'`);
    expect(unquoteString(`"\\""`)).toEqual(`"`);
    expect(unquoteString(`"[]"`)).toEqual(`[]`);
    expect(unquoteString(`"\\[\\]"`)).toEqual(`\\[\\]`);
    expect(unquoteString(`"a\\\\b"`)).toEqual(`a\\\\b`);
    expect(unquoteString(`"\n"`)).toEqual(`\n`);
    expect(unquoteString(`"unfinished`)).toEqual(`unfinished`);
  });

  it("should handle single-quoted strings", () => {
    expect(unquoteString(`'A'`)).toEqual(`A`);
    expect(unquoteString(`'PQ'`)).toEqual(`PQ`);
    expect(unquoteString(`'XYZ'`)).toEqual(`XYZ`);
    expect(unquoteString(`'foo bar'`)).toEqual(`foo bar`);
    expect(unquoteString(`'\\''`)).toEqual(`'`);
    expect(unquoteString(`'"'`)).toEqual(`"`);
    expect(unquoteString(`'[]'`)).toEqual(`[]`);
    expect(unquoteString(`'\\[\\]'`)).toEqual(`\\[\\]`);
    expect(unquoteString(`'a\\\\b'`)).toEqual(`a\\\\b`);
    expect(unquoteString(`'\n'`)).toEqual(`\n`);
    expect(unquoteString(`'unfinished`)).toEqual(`unfinished`);
  });

  it("should handle bracket-quoted strings", () => {
    expect(unquoteString(`[A]`)).toEqual(`A`);
    expect(unquoteString(`[PQ]`)).toEqual(`PQ`);
    expect(unquoteString(`[XYZ]`)).toEqual(`XYZ`);
    expect(unquoteString(`[foo bar]`)).toEqual(`foo bar`);
    expect(unquoteString(`[']`)).toEqual(`'`);
    expect(unquoteString(`["]`)).toEqual(`"`);
    expect(unquoteString(`[a\\[\\]b]`)).toEqual(`a[]b`);
    expect(unquoteString(`[\\\\]`)).toEqual(`\\\\`);
    expect(unquoteString(`[\n]`)).toEqual(`\n`);
    expect(unquoteString(`[unfinished`)).toEqual(`unfinished`);
  });

  const QUOTES = ["'", '"', "["] as const;

  it.each(QUOTES)(
    "should perform faithful round-trip operations with %s-quoted strings",
    (QUOTE) => {
      const rt = (str: string) => unquoteString(quoteString(str, QUOTE));
      expect(rt(`A`)).toEqual(`A`);
      expect(rt(`PQ`)).toEqual(`PQ`);
      expect(rt(`XYZ`)).toEqual(`XYZ`);
      expect(rt(`foo bar`)).toEqual(`foo bar`);
      expect(rt(`\b`)).toEqual(`\b`);
      expect(rt(`Tab: \t`)).toEqual(`Tab: \t`);
      expect(rt(`CR: \r`)).toEqual(`CR: \r`);
      expect(rt(`LF: \n`)).toEqual(`LF: \n`);
      expect(rt(`FF: \f`)).toEqual(`FF: \f`);
      expect(rt(`Backslash: \\\\`)).toEqual(`Backslash: \\\\`);
      expect(rt(`\b\t\r\n\f\\\\`)).toEqual(`\b\t\r\n\f\\\\`);
    },
  );

  it("should be possible to specify the quote being unquoted", () => {
    expect(unquoteString(`[XYZ]`, "[")).toEqual(`XYZ`);
    expect(unquoteString(`[XYZ`, "[")).toEqual(`XYZ`);
    expect(unquoteString(`[XYZ"`, "[")).toEqual(`XYZ"`);
    expect(unquoteString(`[XYZ'`, "[")).toEqual(`XYZ'`);
    expect(unquoteString(`XYZ]`, "[")).toEqual(`XYZ`);
    expect(unquoteString(`"XYZ]`, "[")).toEqual(`"XYZ`);
    expect(unquoteString(`'XYZ]`, "[")).toEqual(`'XYZ`);
    expect(unquoteString(`XYZ`, "[")).toEqual(`XYZ`);
    expect(unquoteString(`"XYZ"`, "[")).toEqual(`"XYZ"`);
    expect(unquoteString(`'XYZ'`, "[")).toEqual(`'XYZ'`);

    expect(unquoteString(`'XYZ'`, "'")).toEqual(`XYZ`);
    expect(unquoteString(`'XYZ`, "'")).toEqual(`XYZ`);
    expect(unquoteString(`'XYZ]`, "'")).toEqual(`XYZ]`);
    expect(unquoteString(`'XYZ"`, "'")).toEqual(`XYZ"`);
    expect(unquoteString(`XYZ'`, "'")).toEqual(`XYZ`);
    expect(unquoteString(`[XYZ'`, "'")).toEqual(`[XYZ`);
    expect(unquoteString(`"XYZ'`, "'")).toEqual(`"XYZ`);
    expect(unquoteString(`"XYZ"`, "'")).toEqual(`"XYZ"`);
    expect(unquoteString(`[XYZ]`, "'")).toEqual(`[XYZ]`);

    expect(unquoteString(`"XYZ"`, '"')).toEqual(`XYZ`);
    expect(unquoteString(`"XYZ`, '"')).toEqual(`XYZ`);
    expect(unquoteString(`"XYZ]`, '"')).toEqual(`XYZ]`);
    expect(unquoteString(`"XYZ'`, '"')).toEqual(`XYZ'`);
    expect(unquoteString(`XYZ"`, '"')).toEqual(`XYZ`);
    expect(unquoteString(`[XYZ"`, '"')).toEqual(`[XYZ`);
    expect(unquoteString(`'XYZ"`, '"')).toEqual(`'XYZ`);
    expect(unquoteString(`'XYZ'`, '"')).toEqual(`'XYZ'`);
    expect(unquoteString(`[XYZ]`, '"')).toEqual(`[XYZ]`);
  });
});
