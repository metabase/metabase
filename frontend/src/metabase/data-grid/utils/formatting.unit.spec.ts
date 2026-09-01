import { parse } from "csv-parse/browser/esm/sync";

import { serializeTsv } from "./formatting";

const roundTrip = (lines: string[][]): string[][] =>
  parse(serializeTsv(lines), { delimiter: "\t" });

describe("serializeTsv", () => {
  it("joins cells with tabs and lines with newlines", () => {
    expect(
      serializeTsv([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBe("a\tb\nc\td");
  });

  it("quotes cells containing tabs, newlines, or carriage returns", () => {
    expect(serializeTsv([["tab\there", "line\nbreak", "cr\rhere"]])).toBe(
      '"tab\there"\t"line\nbreak"\t"cr\rhere"',
    );
  });

  it("round-trips quoted cells, doubling their embedded quotes", () => {
    const lines = [['say "hi"\twith tab', 'multi\n"quoted"']];
    expect(roundTrip(lines)).toEqual(lines);
  });

  it("leaves cells without delimiters unquoted, even when they contain quotes", () => {
    expect(serializeTsv([['say "hi"', '{"tags":["a","b"]}']])).toBe(
      'say "hi"\t{"tags":["a","b"]}',
    );
  });

  it("keeps empty cells so the pasted shape survives", () => {
    expect(serializeTsv([["a", "", "c"]])).toBe("a\t\tc");
  });
});
