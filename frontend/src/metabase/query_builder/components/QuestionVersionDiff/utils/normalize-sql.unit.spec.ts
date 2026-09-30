import { collapseWhitespace, normalizeSqlFormatting } from "./normalize-sql";

describe("collapseWhitespace", () => {
  it("normalizes indentation, spacing and blank lines", () => {
    expect(collapseWhitespace("  SELECT   a,\n\n\tb\r\nFROM  t  ")).toBe(
      "SELECT a,\nb\nFROM t",
    );
  });
});

describe("normalizeSqlFormatting", () => {
  it("treats formatting-only changes as equal", async () => {
    const compact = "select a,b,c from orders where status='OPEN'";
    const formatted =
      "SELECT\n    a,\n    b,\n    c\nFROM orders\nWHERE status = 'OPEN'";

    const [normalizedCompact, normalizedFormatted] = await Promise.all([
      normalizeSqlFormatting(compact, "postgres"),
      normalizeSqlFormatting(formatted, "postgres"),
    ]);

    expect(normalizedCompact).toBe(normalizedFormatted);
  });

  it("keeps real changes visible", async () => {
    const [before, after] = await Promise.all([
      normalizeSqlFormatting("SELECT a FROM t WHERE x = 1", "h2"),
      normalizeSqlFormatting("SELECT a FROM t WHERE x = 2", "h2"),
    ]);

    expect(before).not.toBe(after);
  });

  it("preserves Metabase variables and optional clauses", async () => {
    const normalized = await normalizeSqlFormatting(
      "SELECT * FROM t WHERE 1=1 [[AND id = {{id}}]]",
      "postgres",
    );

    expect(normalized).toContain("{{id}}");
    expect(normalized).toContain("[[AND id = {{id}}]]");
  });

  it("falls back to whitespace collapsing for unsupported engines", async () => {
    expect(await normalizeSqlFormatting("SELECT  a\n   FROM t", "sqlite")).toBe(
      "SELECT a\nFROM t",
    );
    expect(await normalizeSqlFormatting("SELECT  a", undefined)).toBe(
      "SELECT a",
    );
  });
});
