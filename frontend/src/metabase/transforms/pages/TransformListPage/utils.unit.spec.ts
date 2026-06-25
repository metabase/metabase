import { createMockMetadata } from "__support__/metadata";
import { getLibQuery } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  RemoteSyncEntity,
  RemoteSyncEntityStatus,
} from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncEntity,
  createMockStructuredDatasetQuery,
  createMockTemplateTag,
  createMockTransform,
  createMockTransformOwner,
  createMockTransformTarget,
} from "metabase-types/api/mocks";

import {
  buildTreeData,
  getDescendantCollectionIds,
  getFolderSyncColor,
  getIncrementalWarning,
  getSyncColorForEntities,
} from "./utils";

const dirtyEntity = (
  status: RemoteSyncEntityStatus,
  overrides: Partial<RemoteSyncEntity> = {},
): RemoteSyncEntity =>
  createMockRemoteSyncEntity({
    model: "transform",
    sync_status: status,
    ...overrides,
  });

jest.mock("metabase/transforms/utils", () => ({
  getLibQuery: jest.fn(),
}));

jest.mock("metabase-lib", () => ({
  ...jest.requireActual<typeof Lib>("metabase-lib"),
  templateTags: jest.fn(),
}));

const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);

const mockGetLibQuery = getLibQuery as jest.MockedFunction<typeof getLibQuery>;
const mockTemplateTags = Lib.templateTags as jest.MockedFunction<
  typeof Lib.templateTags
>;

describe("buildTreeData", () => {
  it("should return empty array when no collections or transforms", () => {
    expect(buildTreeData(undefined, undefined)).toEqual([]);
    expect(buildTreeData([], [])).toEqual([]);
  });

  it("should include owner data in transform nodes", () => {
    const owner = createMockTransformOwner({
      id: 1,
      first_name: "Test",
      last_name: "Owner",
      email: "test@example.com",
    });
    const transform = createMockTransform({
      id: 1,
      name: "Test Transform",
      owner_user_id: 1,
      owner,
    });

    const result = buildTreeData([], [transform]);

    expect(result).toHaveLength(1);
    expect(result[0].owner).toEqual(owner);
    expect(result[0].owner_email).toBeUndefined();
  });

  it("should include owner_email in transform nodes when set", () => {
    const transform = createMockTransform({
      id: 1,
      name: "Test Transform",
      owner_email: "external@example.com",
      owner: createMockTransformOwner({ email: "external@example.com" }),
    });

    const result = buildTreeData([], [transform]);

    expect(result).toHaveLength(1);
    expect(result[0].owner).toMatchObject({ email: "external@example.com" });
    expect(result[0].owner_email).toBe("external@example.com");
  });

  it("should handle transforms without owners", () => {
    const transform = createMockTransform({
      id: 1,
      name: "Test Transform",
      owner: undefined,
      owner_email: undefined,
    });

    const result = buildTreeData([], [transform]);

    expect(result).toHaveLength(1);
    expect(result[0].owner).toBeUndefined();
    expect(result[0].owner_email).toBeUndefined();
  });

  it("should handle multiple transforms with different owner types", () => {
    const userOwner = createMockTransformOwner({
      id: 1,
      first_name: "User",
      last_name: "Owner",
      email: "user@example.com",
    });

    const transforms = [
      createMockTransform({
        id: 1,
        name: "Transform with user owner",
        owner_user_id: 1,
        owner: userOwner,
      }),
      createMockTransform({
        id: 2,
        name: "Transform with email owner",
        owner_email: "external@example.com",
        owner: createMockTransformOwner({ email: "external@example.com" }),
      }),
      createMockTransform({
        id: 3,
        name: "Transform without owner",
        owner: undefined,
      }),
    ];

    const result = buildTreeData([], transforms);

    expect(result).toHaveLength(3);
    expect(result[0].owner).toEqual(userOwner);
    expect(result[1].owner).toMatchObject({ email: "external@example.com" });
    expect(result[1].owner_email).toBe("external@example.com");
    expect(result[2].owner).toBeUndefined();
  });
});

describe("getDescendantCollectionIds", () => {
  it("includes the folder's own collection id and all nested folder ids", () => {
    const collections = [
      createMockCollection({
        id: 1,
        name: "Parent",
        children: [
          createMockCollection({
            id: 2,
            name: "Child",
            children: [createMockCollection({ id: 3, name: "Grandchild" })],
          }),
        ],
      }),
    ];

    const [parentNode] = buildTreeData(collections, []);

    expect(getDescendantCollectionIds(parentNode)).toEqual(new Set([1, 2, 3]));
  });

  it("ignores transform leaves and counts only collection ids", () => {
    const collections = [
      createMockCollection({ id: 10, name: "Folder", children: [] }),
    ];
    const transforms = [
      createMockTransform({ id: 99, name: "T", collection_id: 10 }),
    ];

    const [folderNode] = buildTreeData(collections, transforms);

    expect(getDescendantCollectionIds(folderNode)).toEqual(new Set([10]));
  });
});

describe("getSyncColorForEntities", () => {
  it("returns undefined when there are no changes", () => {
    expect(getSyncColorForEntities([])).toBeUndefined();
  });

  it("colors a created entity green (success)", () => {
    expect(getSyncColorForEntities([dirtyEntity("create")])).toBe("success");
  });

  it("colors an updated entity amber (warning)", () => {
    expect(getSyncColorForEntities([dirtyEntity("update")])).toBe("warning");
  });

  it("colors a removed entity red (danger)", () => {
    expect(getSyncColorForEntities([dirtyEntity("removed")])).toBe("danger");
  });
});

describe("getFolderSyncColor", () => {
  const collection = (id: number, status: RemoteSyncEntityStatus) =>
    dirtyEntity(status, { id, model: "collection" });
  const childTransform = (
    collectionId: number,
    status: RemoteSyncEntityStatus,
  ) =>
    dirtyEntity(status, {
      id: 100 + collectionId,
      collection_id: collectionId,
    });

  it("returns undefined when the subtree has no changes", () => {
    expect(getFolderSyncColor([], 1)).toBeUndefined();
  });

  it("colors a brand-new folder green", () => {
    expect(getFolderSyncColor([collection(1, "create")], 1)).toBe("success");
  });

  it("colors a renamed or moved folder amber, not green", () => {
    expect(getFolderSyncColor([collection(1, "update")], 1)).toBe("warning");
  });

  it("colors an existing folder amber when it only contains new children", () => {
    expect(getFolderSyncColor([childTransform(1, "create")], 1)).toBe(
      "warning",
    );
  });

  it("colors an existing folder amber when a child was removed", () => {
    expect(getFolderSyncColor([childTransform(1, "removed")], 1)).toBe(
      "warning",
    );
  });

  it("keeps a brand-new folder green even with new children", () => {
    expect(
      getFolderSyncColor(
        [collection(1, "create"), childTransform(1, "create")],
        1,
      ),
    ).toBe("success");
  });

  it("keeps nested brand-new folders green (new folder > new folder > new transform)", () => {
    const subtree = [
      collection(1, "create"),
      collection(2, "create"),
      childTransform(2, "create"),
    ];
    expect(getFolderSyncColor(subtree, 1)).toBe("success");
    expect(
      getFolderSyncColor(
        [collection(2, "create"), childTransform(2, "create")],
        2,
      ),
    ).toBe("success");
  });
});

describe("getIncrementalWarning", () => {
  const metadata = createMockMetadata({});

  it("should return undefined for non-incremental transform", () => {
    const transform = createMockTransform({
      target: createMockTransformTarget({ type: "table" }),
    });

    expect(getIncrementalWarning(transform, metadata)).toBeUndefined();
  });

  it("should warn when native query has no table variables", () => {
    mockGetLibQuery.mockReturnValue(query);
    mockTemplateTags.mockReturnValue({
      snippet1: createMockTemplateTag({
        id: "1",
        name: "snippet1",
        type: "snippet",
      }),
    });

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    const result = getIncrementalWarning(transform, metadata);
    expect(result).toMatch(/table variable/);
  });

  it("should warn when native query has no lib query (getLibQuery returns null)", () => {
    mockGetLibQuery.mockReturnValue(null);

    const transform = createMockTransform({
      source_type: "native",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    const result = getIncrementalWarning(transform, metadata);
    expect(result).toMatch(/table variable/);
  });

  it("should warn when incremental transform has no checkpoint field", () => {
    mockGetLibQuery.mockReturnValue(query);
    mockTemplateTags.mockReturnValue({
      my_table: createMockTemplateTag({
        id: "1",
        name: "my_table",
        type: "table",
        "table-id": 42,
      }),
    });

    const transform = createMockTransform({
      source_type: "native",
      source: {
        type: "query",
        query: createMockStructuredDatasetQuery(),
      },
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    const result = getIncrementalWarning(transform, metadata);
    expect(result).toMatch(/checkpoint field/);
  });

  it("should return undefined for properly configured native incremental transform", () => {
    mockGetLibQuery.mockReturnValue(query);
    mockTemplateTags.mockReturnValue({
      my_table: createMockTemplateTag({
        id: "1",
        name: "my_table",
        type: "table",
        "table-id": 42,
      }),
    });

    const transform = createMockTransform({
      source_type: "native",
      source: {
        type: "query",
        query: createMockStructuredDatasetQuery(),
        "source-incremental-strategy": {
          type: "checkpoint",
          "checkpoint-filter-field-id": 99,
        },
      },
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(getIncrementalWarning(transform, metadata)).toBeUndefined();
  });

  it("should warn when mbql incremental transform has no checkpoint field", () => {
    const transform = createMockTransform({
      source_type: "mbql",
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    const result = getIncrementalWarning(transform, metadata);
    expect(result).toMatch(/checkpoint field/);
  });

  it("should return undefined for properly configured mbql incremental transform", () => {
    const transform = createMockTransform({
      source_type: "mbql",
      source: {
        type: "query",
        query: createMockStructuredDatasetQuery(),
        "source-incremental-strategy": {
          type: "checkpoint",
          "checkpoint-filter-field-id": 99,
        },
      },
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    expect(getIncrementalWarning(transform, metadata)).toBeUndefined();
  });
});
