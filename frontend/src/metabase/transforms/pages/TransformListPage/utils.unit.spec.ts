import type { TransformOwner } from "metabase-types/api";
import {
  createMockTransform,
  createMockTransformOwner,
} from "metabase-types/api/mocks";

import { buildTreeData } from "./utils";

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
