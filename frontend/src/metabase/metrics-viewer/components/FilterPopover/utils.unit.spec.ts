import { filterDisplayGroupsBySearch } from "./utils";

type TestItem = { name: string };

type TestGroup = {
  id: string;
  sections: { name: string; items: TestItem[] }[];
};

function makeGroup(id: string, items: { name: string }[][]): TestGroup {
  return {
    id,
    sections: items.map((sectionItems, index) => ({
      name: `Section ${index}`,
      items: sectionItems,
    })),
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
      },
      {
        id: "orders",
        sections: [{ name: "Section 0", items: [{ name: "Created At" }] }],
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
      },
      {
        id: "orders",
        sections: [
          {
            name: "Section 0",
            items: [{ name: "Order Date" }, { name: "Created At" }],
          },
        ],
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
      },
    ]);
  });

  it("filters out sections with no matching items", () => {
    expect(filterDisplayGroupsBySearch(groups, "order date")).toEqual([
      {
        id: "orders",
        sections: [{ name: "Section 0", items: [{ name: "Order Date" }] }],
      },
    ]);
  });
});
