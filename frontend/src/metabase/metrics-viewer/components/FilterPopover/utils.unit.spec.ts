import { filterDisplayGroupsBySearch } from "./utils";

type TestItem = { name: string };

type TestSegment = { name: string };

type TestGroup = {
  id: string;
  sections: { name: string; items: TestItem[] }[];
  segments?: TestSegment[];
};

function makeGroup(
  id: string,
  items: { name: string }[][],
  segments?: TestSegment[],
): TestGroup {
  return {
    id,
    sections: items.map((sectionItems, index) => ({
      name: `Section ${index}`,
      items: sectionItems,
    })),
    segments,
  };
}

describe("filterDisplayGroupsBySearch", () => {
  const groups: TestGroup[] = [
    makeGroup("revenue", [
      [{ name: "Created At" }, { name: "Updated At" }],
      [{ name: "Category" }, { name: "Region" }],
    ]),
    makeGroup("orders", [[{ name: "Order Date" }, { name: "Created At" }]]),
  ];

  it("returns null for empty search text", () => {
    expect(filterDisplayGroupsBySearch(groups, "")).toBeNull();
  });

  it("returns null for whitespace-only search text", () => {
    expect(filterDisplayGroupsBySearch(groups, "   ")).toBeNull();
  });

  it("filters items with case-insensitive partial match", () => {
    expect(filterDisplayGroupsBySearch(groups, "created")).toEqual([
      {
        id: "revenue",
        sections: [{ name: "Section 0", items: [{ name: "Created At" }] }],
        segments: undefined,
      },
      {
        id: "orders",
        sections: [{ name: "Section 0", items: [{ name: "Created At" }] }],
        segments: undefined,
      },
    ]);
  });

  it("matches items across multiple sections in a group", () => {
    expect(filterDisplayGroupsBySearch(groups, "at")).toEqual([
      {
        id: "revenue",
        sections: [
          {
            name: "Section 0",
            items: [{ name: "Created At" }, { name: "Updated At" }],
          },
          { name: "Section 1", items: [{ name: "Category" }] },
        ],
        segments: undefined,
      },
      {
        id: "orders",
        sections: [
          {
            name: "Section 0",
            items: [{ name: "Order Date" }, { name: "Created At" }],
          },
        ],
        segments: undefined,
      },
    ]);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterDisplayGroupsBySearch(groups, "zzzzz")).toEqual([]);
  });

  it("filters out groups with no matching sections", () => {
    expect(filterDisplayGroupsBySearch(groups, "region")).toEqual([
      {
        id: "revenue",
        sections: [{ name: "Section 1", items: [{ name: "Region" }] }],
        segments: undefined,
      },
    ]);
  });

  it("filters out sections with no matching items", () => {
    expect(filterDisplayGroupsBySearch(groups, "order date")).toEqual([
      {
        id: "orders",
        sections: [{ name: "Section 0", items: [{ name: "Order Date" }] }],
        segments: undefined,
      },
    ]);
  });

  describe("with segments", () => {
    const groupsWithSegments: TestGroup[] = [
      makeGroup(
        "revenue",
        [[{ name: "Created At" }, { name: "Category" }]],
        [{ name: "Active customers" }, { name: "Archived" }],
      ),
      makeGroup("orders", [[{ name: "Order Date" }]], [{ name: "Big orders" }]),
    ];

    it("matches segment names alongside dimension names", () => {
      expect(filterDisplayGroupsBySearch(groupsWithSegments, "active")).toEqual(
        [
          {
            id: "revenue",
            sections: [],
            segments: [{ name: "Active customers" }],
          },
        ],
      );
    });

    it("keeps a group when only its segments match", () => {
      expect(filterDisplayGroupsBySearch(groupsWithSegments, "big")).toEqual([
        {
          id: "orders",
          sections: [],
          segments: [{ name: "Big orders" }],
        },
      ]);
    });

    it("matches dimensions and segments together", () => {
      expect(filterDisplayGroupsBySearch(groupsWithSegments, "order")).toEqual([
        {
          id: "orders",
          sections: [{ name: "Section 0", items: [{ name: "Order Date" }] }],
          segments: [{ name: "Big orders" }],
        },
      ]);
    });

    it("excludes groups whose dimensions and segments all miss", () => {
      expect(
        filterDisplayGroupsBySearch(groupsWithSegments, "nomatch"),
      ).toEqual([]);
    });
  });
});
