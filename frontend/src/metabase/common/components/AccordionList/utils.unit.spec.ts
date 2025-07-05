import { getNextCursor, getPrevCursor } from "./utils";

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
