import {
  createMockCollection,
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { buildActiveActionTree, buildArchivedActionTree } from "./utils";

const ROOT = createMockCollection({
  id: "root",
  name: "Data actions",
  namespace: "data-actions",
});
const FOLDER = createMockCollection({
  id: 10,
  name: "Billing",
  namespace: "data-actions",
  parent_id: null,
});

describe("buildActiveActionTree", () => {
  it("should put actions without a model under the root and their folders", () => {
    const tree = buildActiveActionTree(
      [ROOT, FOLDER],
      [
        createMockQueryAction({ id: 1, name: "At root", collection_id: null }),
        createMockQueryAction({ id: 2, name: "In folder", collection_id: 10 }),
      ],
      true,
    );

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      id: "collection:data-actions-root",
      name: "Data actions",
      children: [
        {
          id: "collection:10",
          children: [{ id: "action:2", model: "action" }],
        },
        { id: "action:1", model: "action" },
      ],
    });
  });

  it("should leave out model actions and actions outside data actions folders", () => {
    const tree = buildActiveActionTree(
      [ROOT],
      [
        createMockImplicitQueryAction({ id: 3, model_id: 5 }),
        createMockQueryAction({ id: 4, collection_id: 99 }),
      ],
      true,
    );

    expect(tree[0].children).toEqual([
      expect.objectContaining({ model: "empty-state" }),
    ]);
  });

  it("should build no tree without a readable root", () => {
    expect(buildActiveActionTree([FOLDER], [], true)).toEqual([]);
  });
});

describe("buildArchivedActionTree", () => {
  it("should list archived folders and the archived data actions outside of them", () => {
    const archivedFolder = { ...FOLDER, archived: true };
    const tree = buildArchivedActionTree(
      [archivedFolder],
      [
        createMockQueryAction({ id: 5, collection_id: 10, archived: true }),
        createMockQueryAction({ id: 6, collection_id: null, archived: true }),
        createMockQueryAction({ id: 7, collection_id: 99, archived: true }),
      ],
      [],
    );

    expect(tree.map((node) => node.id)).toEqual(["collection:10", "action:6"]);
    expect(tree[0].children?.map((node) => node.id)).toEqual(["action:5"]);
  });
});
