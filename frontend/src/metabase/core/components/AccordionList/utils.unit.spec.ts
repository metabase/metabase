import { getPrevCursor, getNextCursor } from "./utils";

const sectionIsExpanded = () => true;
const sectionIsNotExpanded = () => false;
const canSelectSection = () => true;
const cannotSelectSection = () => false;
const filterAll = () => true;
const filterEvenIds = (item: any) => item.id % 2 === 0;

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

describe("getNextCursor", () => {
  it("returns the first section selected when initial cursor is null and selecting sections allowed", () => {
    expect(
      getNextCursor(
        null,
        sections,
        sectionIsExpanded,
        canSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: null });
  });

  it("returns the first item of the first section selected when initial cursor is null and selecting sections is not allowed", () => {
    expect(
      getNextCursor(
        null,
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 0 });
  });

  it("returns the first item of the first section selected when initial cursor is on the first section", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: null },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 0 });
  });

  it("returns the section section if first section is selected but not expanded", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: null },
        sections,
        sectionIsNotExpanded,
        canSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: null });
  });

  it("returns the second item when the first was selected", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: 0 },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 1 });
  });

  it("returns the second section when on the last item of the first section and selecting sections is allowed", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: 1 },
        sections,
        sectionIsExpanded,
        canSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: null });
  });

  it("returns the first item of the second section when on the last item of the first section and selecting sections is not allowed", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: 1 },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: 0 });
  });

  it("returns the last item when on the last item", () => {
    expect(
      getNextCursor(
        { sectionIndex: 1, itemIndex: 1 },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: 1 });
  });

  it("skips filtered out items", () => {
    expect(
      getNextCursor(
        { sectionIndex: 0, itemIndex: 1 },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterEvenIds,
      ),
    ).toStrictEqual({ sectionIndex: 1, itemIndex: 1 });
  });
});

describe("getPrevCursor", () => {
  it("returns the first section when initial cursor is null and selecting sections allowed", () => {
    expect(
      getPrevCursor(
        null,
        sections,
        sectionIsExpanded,
        canSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: null });
  });

  it("returns the first section when on the first item and selecting sections allowed", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 0, itemIndex: 0 },
        sections,
        sectionIsExpanded,
        canSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: null });
  });

  it("returns the first item when on the first item and selecting sections is not allowed", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 0, itemIndex: 0 },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 0 });
  });

  it("returns the first item when on the second item", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 0, itemIndex: 1 },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 0 });
  });

  it("returns first section when on the second and the first is collapsed", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 1, itemIndex: null },
        sections,
        sectionIsNotExpanded,
        canSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: null });
  });

  it("returns the last item of the first section when on the second section and the first is expanded", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 1, itemIndex: null },
        sections,
        sectionIsExpanded,
        canSelectSection,
        filterAll,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 1 });
  });

  it("skips filtered out items", () => {
    expect(
      getPrevCursor(
        { sectionIndex: 1, itemIndex: 1 },
        sections,
        sectionIsExpanded,
        cannotSelectSection,
        filterEvenIds,
      ),
    ).toStrictEqual({ sectionIndex: 0, itemIndex: 1 });
  });
});
