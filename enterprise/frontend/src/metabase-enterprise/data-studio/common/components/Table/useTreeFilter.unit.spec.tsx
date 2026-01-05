import { renderHook } from "__support__/ui";

import { useTreeFilter } from "./useTreeFilter";

type Node = {
  name: string;
  category: string;
  children?: Node[];
};

const TEST_TREE: Node[] = [
  {
    name: "FOO",
    category: "Doohickey",
    children: [
      {
        name: "Hudson Borer",
        category: "Doohickey",
      },
      {
        name: "Domenica Williamson",
        category: "Doohickey",
      },
      {
        name: "Lina Heaney",
        category: "Gadget",
      },
      {
        name: "Arnold Adams",
        category: "Doohickey",
      },
    ],
  },
  {
    name: "BAR",
    category: "Gadget",
    children: [
      {
        name: "Rene Muller",
        category: "Gadget",
      },
      {
        name: "Roselyn Bosco",
        category: "Gadget",
        children: [
          {
            name: "Lavonne Senger",
            category: "Doohickey",
          },
        ],
      },
      {
        name: "Aracely Jenkins",
        category: "Gadget",
      },
      {
        name: "Anais Ward",
        category: "Doohickey",
      },
    ],
  },
];

describe("useTreeFilter", () => {
  it("should filter child nodes using specified props", () => {
    const {
      result: { current: tree },
    } = renderHook(() =>
      useTreeFilter({
        data: TEST_TREE,
        searchProps: ["category"],
        searchQuery: "gadg",
      }),
    );

    // This is actually asserting many things
    // - Only leaf nodes are considered in search,
    // - parent nodes with no filtered children should not be returned. this is why Roselyn was filtered out
    // - We shouldn't change the order that of returned values
    // - That search is not case sensitive

    expect(tree).toMatchObject([
      {
        name: "FOO",
        children: [expect.objectContaining({ name: "Lina Heaney" })],
      },
      {
        name: "BAR",
        children: [
          expect.objectContaining({ name: "Rene Muller" }),
          expect.objectContaining({ name: "Aracely Jenkins" }),
        ],
      },
    ]);
  });
});
