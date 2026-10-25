import type { CollectionPermissions } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";

import { updateCollectionPermissions } from "./utils";

const GRANDCHILD = createMockCollection({ id: 3, name: "Grandchild" });
const PERSONAL_CHILD = createMockCollection({
  id: 4,
  name: "Personal",
  is_personal: true,
});
const CHILD = createMockCollection({
  id: 2,
  name: "Child",
  children: [GRANDCHILD],
});
const PARENT = createMockCollection({
  id: 1,
  name: "Parent",
  children: [CHILD, PERSONAL_CHILD],
});

const ORIGINAL: CollectionPermissions = {
  10: { 1: "none", 2: "read", 3: "none", 4: "none" },
};

describe("updateCollectionPermissions", () => {
  it("changes only the collection when propagation is not set", () => {
    expect(
      updateCollectionPermissions(ORIGINAL, ORIGINAL, {
        groupId: 10,
        collection: PARENT,
        value: "write",
        shouldPropagateToChildren: null,
      }),
    ).toEqual({ 10: { 1: "write", 2: "read", 3: "none", 4: "none" } });
  });

  it("propagates to non-personal descendants", () => {
    expect(
      updateCollectionPermissions(ORIGINAL, ORIGINAL, {
        groupId: 10,
        collection: PARENT,
        value: "write",
        shouldPropagateToChildren: true,
      }),
    ).toEqual({ 10: { 1: "write", 2: "write", 3: "write", 4: "none" } });
  });

  it("restores the saved descendant permissions when propagation is turned off", () => {
    const propagated: CollectionPermissions = {
      10: { 1: "write", 2: "write", 3: "write", 4: "none" },
    };

    expect(
      updateCollectionPermissions(propagated, ORIGINAL, {
        groupId: 10,
        collection: PARENT,
        value: "write",
        shouldPropagateToChildren: false,
      }),
    ).toEqual({ 10: { 1: "write", 2: "read", 3: "none", 4: "none" } });
  });

  it("drops a descendant without a saved permission when propagation is turned off", () => {
    const original: CollectionPermissions = { 10: { 1: "none" } };
    const propagated = updateCollectionPermissions(original, original, {
      groupId: 10,
      collection: PARENT,
      value: "write",
      shouldPropagateToChildren: true,
    });

    expect(
      updateCollectionPermissions(propagated, original, {
        groupId: 10,
        collection: PARENT,
        value: "none",
        shouldPropagateToChildren: false,
      }),
    ).toStrictEqual(original);
  });

  it("does not modify its input", () => {
    const permissions: CollectionPermissions = { 10: { 1: "none" } };

    updateCollectionPermissions(permissions, ORIGINAL, {
      groupId: 10,
      collection: PARENT,
      value: "write",
      shouldPropagateToChildren: true,
    });

    expect(permissions).toEqual({ 10: { 1: "none" } });
  });
});
