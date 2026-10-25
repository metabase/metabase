import type {
  CollectionNamespace,
  CollectionPermission,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockGroup,
} from "metabase-types/api/mocks";

import { getCollectionsPermissionEditor } from "./collection-editor";

const ALL_USERS_GROUP = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const OTHER_GROUP = createMockGroup({
  id: 3,
  name: "Analysts",
  magic_group_type: null,
});

const COLLECTION = createMockCollection({ id: 10, name: "Folder" });

const getEditor = (
  namespace: CollectionNamespace,
  value: CollectionPermission = "read",
) =>
  getCollectionsPermissionEditor({
    permissions: { [OTHER_GROUP.id]: { [COLLECTION.id]: value } },
    collection: COLLECTION,
    groups: [ALL_USERS_GROUP, OTHER_GROUP],
    namespace,
  });

const getOtherGroupOptions = (namespace: CollectionNamespace) =>
  getEditor(namespace)
    .entities.find((entity) => entity.id === OTHER_GROUP.id)
    ?.permissions?.[0].options.map((option) => option.value);

describe("getCollectionsPermissionEditor", () => {
  it.each<[CollectionNamespace, string]>([
    [
      "data-actions",
      "Only administrators can create and edit data actions. Groups with View access can run them.",
    ],
    [
      "data-apps",
      "Only administrators can create and edit data apps. Groups with View access can use them.",
    ],
  ])("keeps curate to admins in the %s namespace", (namespace, hint) => {
    expect(getOtherGroupOptions(namespace)).toEqual(["read", "none"]);
    expect(getEditor(namespace).columns[1].hint).toBe(hint);
  });

  it.each<CollectionNamespace>([null, "snippets"])(
    "offers curate without a hint in the %s namespace",
    (namespace) => {
      expect(getOtherGroupOptions(namespace)).toEqual([
        "write",
        "read",
        "none",
      ]);
      expect(getEditor(namespace).columns[1].hint).toBeUndefined();
    },
  );

  it("keeps an existing curate value selectable in an admin-only namespace", () => {
    const options = getEditor("data-actions", "write")
      .entities.find((entity) => entity.id === OTHER_GROUP.id)
      ?.permissions?.[0].options.map((option) => option.value);

    expect(options).toEqual(["write", "read", "none"]);
  });
});
