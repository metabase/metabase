import type { TreeItem } from "../types";

import { filterTreeByName } from "./filter-tree-by-name";

const snippet = (id: number, name: string): TreeItem => ({
  id: `snippet:${id}`,
  name,
  icon: "snippet",
  model: "snippet",
  data: { id, name, model: "snippet" },
});

const folder = (id: number, name: string, children: TreeItem[]): TreeItem => ({
  id: `collection:${id}`,
  name,
  icon: "folder",
  model: "collection",
  data: { id, name, model: "collection" },
  children,
});

describe("filterTreeByName", () => {
  it("keeps matching leaves and the folders leading to them", () => {
    const tree = [
      folder(1, "Root", [
        snippet(1, "Orders filter"),
        folder(2, "Nested", [snippet(2, "Revenue"), snippet(3, "Orders sum")]),
      ]),
    ];

    expect(filterTreeByName(tree, " orders ")).toEqual([
      folder(1, "Root", [
        snippet(1, "Orders filter"),
        folder(2, "Nested", [snippet(3, "Orders sum")]),
      ]),
    ]);
  });

  it("drops folders whose names match but contain no matching leaves", () => {
    const tree = [folder(1, "Orders", [snippet(1, "Revenue")])];

    expect(filterTreeByName(tree, "orders")).toEqual([]);
  });
});
