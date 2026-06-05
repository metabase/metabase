import type { Row } from "./types";
import { getNextCursor, getPrevCursor, getRowKey } from "./utils";

const canSelectSection = () => true;
const cannotSelectSection = () => false;

const sections = [
  {
    id: 1,
    items: [
      {
        id: 1,
      },
      {
        id: 2,
      },
    ],
  },
  {
    id: 2,
    items: [
      {
        id: 3,
      },
      {
        id: 4,
      },
    ],
  },
];

const rows = [
  {
    type: "header" as const,
    section: sections[0],
    sectionIndex: 0,
    isLastSection: false,
  },
  {
    type: "item" as const,
    section: sections[0],
    sectionIndex: 0,
    itemIndex: 0,
    item: sections[0].items[0],
    isLastSection: false,
    isLastItem: false,
  },
  {
    type: "item" as const,
    section: sections[0],
    sectionIndex: 0,
    itemIndex: 1,
    item: sections[0].items[1],
    isLastSection: false,
    isLastItem: true,
  },
  {
    type: "header" as const,
    section: sections[1],
    sectionIndex: 1,
    isLastSection: true,
  },
  {
    type: "item" as const,
    section: sections[1],
    sectionIndex: 1,
    itemIndex: 0,
    item: sections[1].items[0],
    isLastSection: true,
    isLastItem: false,
  },
  {
    type: "item" as const,
    section: sections[1],
    sectionIndex: 1,
    itemIndex: 1,
    item: sections[1].items[1],
    isLastSection: true,
    isLastItem: true,
  },
];

describe("getNextCursor", () => {
  it("returns the first section selected when initial cursor is null and selecting sections allowed", () => {
    expect(getNextCursor(null, rows, canSelectSection)).toStrictEqual({
      sectionIndex: 0,
      itemIndex: null,
    });
  });

  it("returns the first item of the first section selected when initial cursor is null and selecting sections is not allowed", () => {
    expect(getNextCursor(null, rows, cannotSelectSection)).toStrictEqual({
      sectionIndex: 0,
      itemIndex: 0,
    });
  });

  it("returns the first item of the first section selected when initial cursor is on the first section", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: null },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 0 });
  });

  it("returns the next section if first section is selected but not expanded", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: null },
        rows.filter((item) => item.type !== "item"),
        canSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: null });
  });

  it("returns the second item when the first was selected", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: 0 },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 1 });
  });

  it("returns the second section when on the last item of the first section and selecting sections is allowed", () => {
    expect(
      getNextCursor({ sectionIndex: 0, itemIndex: 1 }, rows, canSelectSection),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: null });
  });

  it("returns the first item of the second section when on the last item of the first section and selecting sections is not allowed", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: 1 },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: 0 });
  });

  it("returns the last item when on the last item", () => {
    expect(
      getNextCursor(
        { sectionIndex: 1, itemIndex: 1 },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: 1 });
  });

  it("skips filtered out items", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: 1 },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: 0 });
  });
});

describe("getPrevCursor", () => {
  it("returns the first section when initial cursor is null and selecting sections allowed", () => {
    expect(getPrevCursor(null, rows, canSelectSection)).toStrictEqual({
      sectionIndex: 0,
      itemIndex: null,
    });
  });

  it("returns the first section when on the first item and selecting sections allowed", () => {
    expect(
      getPrevCursor({ sectionIndex: 0, itemIndex: 0 }, rows, canSelectSection),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: null });
  });

  it("returns the first item when on the first item and selecting sections is not allowed", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 0, itemIndex: 0 },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 0 });
  });

  it("returns the first item when on the second item", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 0, itemIndex: 1 },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 0 });
  });

  it("returns first section when on the second and the first is collapsed", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 1, itemIndex: null },
        rows.filter((item) => item.type !== "item"),
        canSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: null });
  });

  it("returns the last item of the first section when on the second section and the first is expanded", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 1, itemIndex: null },
        rows,
        canSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 1 });
  });

  it("skips filtered out items", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 1, itemIndex: 0 },
        rows,
        cannotSelectSection,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 1 });
  });
});

describe("getRowKey", () => {
  const headerRow = (name: string, sectionIndex: number): Row<any, any> => ({
    type: "header",
    section: { name },
    sectionIndex,
    isLastSection: false,
  });

  it("keys a row by its section name rather than its position", () => {
    expect(getRowKey(headerRow("Writable Postgres12", 1))).toBe(
      getRowKey(headerRow("Writable Postgres12", 2)),
    );
  });

  it("keeps a row's key stable when a section is inserted ahead of it (metabase#52411)", () => {
    // Before "Saved Questions" loads, the database is at index 1; after it is
    // prepended, the same database shifts to index 2. Its key must not change,
    // otherwise React remounts it and detaches it mid-click.
    const before = headerRow("Writable Postgres12", 1);
    const after = headerRow("Writable Postgres12", 2);
    expect(getRowKey(before)).toBe(getRowKey(after));
  });

  it("prefers an explicit section key over the name", () => {
    const row: Row<any, any> = {
      type: "header",
      section: { key: "db-7", name: "Writable Postgres12" },
      sectionIndex: 3,
      isLastSection: false,
    };
    expect(getRowKey(row)).toBe("db-7::header");
  });

  it("falls back to the section index when there is no stable identity", () => {
    const row: Row<any, any> = {
      type: "header",
      section: {},
      sectionIndex: 2,
      isLastSection: false,
    };
    expect(getRowKey(row)).toBe("index:2::header");
  });

  it("disambiguates items within a section by their item index", () => {
    const section = { name: "Wild" };
    const item0: Row<any, any> = {
      type: "item",
      section,
      sectionIndex: 0,
      itemIndex: 0,
      isLastItem: false,
      isLastSection: true,
      item: { id: 1 },
    };
    const item1: Row<any, any> = { ...item0, itemIndex: 1, item: { id: 2 } };
    expect(getRowKey(item0)).not.toBe(getRowKey(item1));
  });
});
