import { getLibQuery } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import type { TransformOwner } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformOwner,
  createMockTransformTarget,
} from "metabase-types/api/mocks";

import { buildTreeData, getIncrementalWarning } from "./utils";

jest.mock("metabase/transforms/utils", () => ({
  getLibQuery: jest.fn(),
}));

jest.mock("metabase-lib", () => ({
  templateTags: jest.fn(),
}));

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
      owner: { email: "external@example.com" } as TransformOwner,
    });

    const result = buildTreeData([], [transform]);

    expect(result).toHaveLength(1);
    expect(result[0].owner).toEqual({ email: "external@example.com" });
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
        owner: { email: "external@example.com" } as TransformOwner,
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
    expect(result[1].owner).toEqual({ email: "external@example.com" });
    expect(result[1].owner_email).toBe("external@example.com");
    expect(result[2].owner).toBeUndefined();
  });
});

describe("getIncrementalWarning", () => {
  const metadata = {} as any;

  beforeEach(() => {
    mockGetLibQuery.mockReset();
    mockTemplateTags.mockReset();
  });

  it("should return undefined for non-incremental transform", () => {
    const transform = createMockTransform({
      target: createMockTransformTarget({ type: "table" }),
    });

    expect(getIncrementalWarning(transform, metadata)).toBeUndefined();
  });

  it("should warn when native query has no table variables", () => {
    const libQuery = {} as any;
    mockGetLibQuery.mockReturnValue(libQuery);
    mockTemplateTags.mockReturnValue({
      snippet1: { id: "1", name: "snippet1", type: "snippet" } as any,
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
    const libQuery = {} as any;
    mockGetLibQuery.mockReturnValue(libQuery);
    mockTemplateTags.mockReturnValue({
      my_table: {
        id: "1",
        name: "my_table",
        type: "table",
        "table-id": 42,
      } as any,
    });

    const transform = createMockTransform({
      source_type: "native",
      source: {
        type: "query",
        query: {} as any,
      },
      target: createMockTransformTarget({ type: "table-incremental" }),
    });

    const result = getIncrementalWarning(transform, metadata);
    expect(result).toMatch(/checkpoint field/);
  });

  it("should return undefined for properly configured native incremental transform", () => {
    const libQuery = {} as any;
    mockGetLibQuery.mockReturnValue(libQuery);
    mockTemplateTags.mockReturnValue({
      my_table: {
        id: "1",
        name: "my_table",
        type: "table",
        "table-id": 42,
      } as any,
    });

    const transform = createMockTransform({
      source_type: "native",
      source: {
        type: "query",
        query: {} as any,
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
      source: {
        type: "query",
        query: {} as any,
      },
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
        query: {} as any,
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
