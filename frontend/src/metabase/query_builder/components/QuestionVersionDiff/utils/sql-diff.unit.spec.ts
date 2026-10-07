import {
  type DiffLine,
  collapseUnchanged,
  computeLineDiff,
  diffLineContent,
  getDiffStats,
  splitLines,
  toSideBySideRows,
} from "./sql-diff";

const text = (line: DiffLine) =>
  line.segments.map((segment) => segment.value).join("");

const summarize = (lines: DiffLine[]) =>
  lines.map((line) => {
    const prefix = { context: " ", added: "+", removed: "-" }[line.type];
    return `${prefix}${text(line)}`;
  });

const changedParts = (line: DiffLine) =>
  line.segments
    .filter((segment) => segment.isChanged)
    .map((segment) => segment.value);

describe("splitLines", () => {
  it("splits on any line ending", () => {
    expect(splitLines("a\nb\r\nc\rd")).toEqual(["a", "b", "c", "d"]);
  });

  it("returns no lines for an empty string", () => {
    expect(splitLines("")).toEqual([]);
  });
});

describe("computeLineDiff", () => {
  it("shows unchanged, removed and added lines in unified order", () => {
    const oldSql = "SELECT *\nFROM PRODUCTS\nWHERE CATEGORY = 'Widget';";
    const newSql =
      "SELECT\n  ID,\n  TITLE\nFROM PRODUCTS\nWHERE CATEGORY IN ('Widget', 'Gadget')\nORDER BY PRICE DESC;";

    expect(summarize(computeLineDiff(oldSql, newSql))).toEqual([
      "-SELECT *",
      "+SELECT",
      "+  ID,",
      "+  TITLE",
      " FROM PRODUCTS",
      "-WHERE CATEGORY = 'Widget';",
      "+WHERE CATEGORY IN ('Widget', 'Gadget')",
      "+ORDER BY PRICE DESC;",
    ]);
  });

  it("numbers lines on each side", () => {
    const lines = computeLineDiff("a\nb\nc", "a\nx\nc\nd");

    expect(
      lines.map(({ type, oldLineNumber, newLineNumber }) => [
        type,
        oldLineNumber,
        newLineNumber,
      ]),
    ).toEqual([
      ["context", 1, 1],
      ["removed", 2, null],
      ["added", null, 2],
      ["context", 3, 3],
      ["added", null, 4],
    ]);
  });

  it("returns only context lines for identical input", () => {
    const lines = computeLineDiff("SELECT 1\nFROM t", "SELECT 1\nFROM t");
    expect(lines.every((line) => line.type === "context")).toBe(true);
    expect(getDiffStats(lines)).toEqual({ added: 0, removed: 0 });
  });

  it("handles empty sides", () => {
    expect(summarize(computeLineDiff("", "SELECT 1"))).toEqual(["+SELECT 1"]);
    expect(summarize(computeLineDiff("SELECT 1", ""))).toEqual(["-SELECT 1"]);
  });

  it("preserves indentation and whitespace", () => {
    const lines = computeLineDiff("  a\n\tb", "  a\n\tb  ");
    expect(summarize(lines)).toEqual(["   a", "-\tb", "+\tb  "]);
  });

  it("highlights the changed words within a modified line", () => {
    const [removed, added] = computeLineDiff(
      "WHERE status = 'OPEN'",
      "WHERE status IN ('OPEN', 'CLOSED')",
    );

    expect(text(removed)).toBe("WHERE status = 'OPEN'");
    expect(text(added)).toBe("WHERE status IN ('OPEN', 'CLOSED')");
    expect(changedParts(removed).join("")).not.toContain("WHERE");
    expect(changedParts(added).join("")).toContain("IN");
    expect(changedParts(added).join("")).toContain("CLOSED");
  });

  it("does not highlight words within unrelated lines", () => {
    const [removed, added] = computeLineDiff("SELECT *", "ORDER BY x");
    expect(changedParts(removed)).toEqual([]);
    expect(changedParts(added)).toEqual([]);
  });

  it("counts added and removed lines", () => {
    expect(getDiffStats(computeLineDiff("a\nb", "a\nc\nd"))).toEqual({
      added: 2,
      removed: 1,
    });
  });
});

describe("diffLineContent", () => {
  it("keeps the full text of both lines", () => {
    const { oldSegments, newSegments } = diffLineContent(
      "SUM(revenue)",
      "SUM(revenue) AS revenue,",
    );
    expect(oldSegments.map((s) => s.value).join("")).toBe("SUM(revenue)");
    expect(newSegments.map((s) => s.value).join("")).toBe(
      "SUM(revenue) AS revenue,",
    );
  });
});

describe("toSideBySideRows", () => {
  it("aligns replaced lines and pads unmatched ones", () => {
    const rows = toSideBySideRows(computeLineDiff("a\nb\nc", "a\nx\ny\nc"));

    expect(
      rows.map(({ left, right }) => [
        left ? text(left) : null,
        right ? text(right) : null,
      ]),
    ).toEqual([
      ["a", "a"],
      ["b", "x"],
      [null, "y"],
      ["c", "c"],
    ]);
  });

  it("puts removed-only lines on the left", () => {
    const rows = toSideBySideRows(computeLineDiff("a\nb", "a"));
    expect(rows[1]).toEqual({ left: expect.anything(), right: null });
  });
});

describe("collapseUnchanged", () => {
  const isUnchanged = (value: string) => value === "=";

  it("keeps context around changes and collapses the rest", () => {
    const items = [..."==========", "+", ..."=========="];
    const blocks = collapseUnchanged(items, isUnchanged, 2);

    expect(blocks.map((block) => [block.type, block.items.length])).toEqual([
      ["collapsed", 8],
      ["visible", 5],
      ["collapsed", 8],
    ]);
  });

  it("does not collapse short runs", () => {
    const items = ["+", "=", "=", "=", "=", "=", "+"];
    expect(collapseUnchanged(items, isUnchanged, 2)).toEqual([
      { type: "visible", items },
    ]);
  });

  it("collapses everything when nothing changed", () => {
    const items = ["=", "=", "="];
    expect(collapseUnchanged(items, isUnchanged, 3)).toEqual([
      { type: "collapsed", items },
    ]);
  });
});
