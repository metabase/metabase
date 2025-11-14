import {
  createMockCollection,
  createMockNativeQuerySnippet,
} from "metabase-types/api/mocks";

import { buildSnippetTree } from "./utils";

describe("buildSnippetTree", () => {
  it("should build tree with nested collections and snippets and filter archived items", () => {
    const tree = buildSnippetTree(
      [
        createMockCollection({ id: "root", parent_id: null }),
        createMockCollection({ id: 1, parent_id: null }),
        createMockCollection({ id: 2, parent_id: 1 }),
        createMockCollection({ id: 3, archived: true, parent_id: null }),
      ],
      [
        createMockNativeQuerySnippet({ id: 10, collection_id: null }),
        createMockNativeQuerySnippet({ id: 11, collection_id: 1 }),
        createMockNativeQuerySnippet({ id: 12, collection_id: 2 }),
        createMockNativeQuerySnippet({
          id: 13,
          collection_id: null,
          archived: true,
        }),
      ],
    );

    expect(tree).toMatchObject([
      {
        name: "SQL snippets",
        icon: "snippet",
        children: [
          {
            id: 1,
            icon: "folder",
            children: [
              {
                id: 2,
                icon: "folder",
                children: [{ id: 12, icon: "snippet" }],
              },
              { id: 11, icon: "snippet" },
            ],
          },
          { id: 10, icon: "snippet" },
        ],
      },
    ]);
  });
});
