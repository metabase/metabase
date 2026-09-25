import { getTargetChildCommentThreads } from "metabase/comments/utils";
import type { Comment } from "metabase-types/api";
import { createMockComment } from "metabase-types/api/mocks/comment";

import { getUnresolvedComments } from "./use-unresolved-comments-count";

const NODE_ID = "paragraph-node";
const DELETED_AT = "2024-01-02T00:00:00Z";

function createThread({
  id,
  isResolved = false,
  deleted,
}: {
  id: number;
  isResolved?: boolean;
  deleted: { root: boolean; replies: [boolean, boolean] };
}): Comment[] {
  const root = createMockComment({
    id,
    child_target_id: NODE_ID,
    is_resolved: isResolved,
    deleted_at: deleted.root ? DELETED_AT : null,
  });
  const replies = deleted.replies.map((isDeleted, index) =>
    createMockComment({
      id: id + index + 1,
      child_target_id: NODE_ID,
      parent_comment_id: id,
      deleted_at: isDeleted ? DELETED_AT : null,
    }),
  );
  return [root, ...replies];
}

const getUnresolvedCount = (comments: Comment[]) =>
  getUnresolvedComments(getTargetChildCommentThreads(comments, NODE_ID))
    .length;

describe("getUnresolvedComments", () => {
  it("counts undeleted comments of unresolved threads on the node", () => {
    const comments = [
      ...createThread({
        id: 1,
        deleted: { root: true, replies: [false, false] },
      }),
      ...createThread({
        id: 4,
        deleted: { root: false, replies: [true, false] },
      }),
      ...createThread({
        id: 7,
        isResolved: true,
        deleted: { root: true, replies: [false, false] },
      }),
      ...createThread({
        id: 10,
        deleted: { root: true, replies: [true, true] },
      }),
      ...createThread({
        id: 13,
        isResolved: true,
        deleted: { root: true, replies: [true, true] },
      }),
      createMockComment({ id: 16, child_target_id: "another-node" }),
    ];

    expect(getUnresolvedCount(comments)).toBe(4);
  });

  it("is zero when every thread is resolved or fully deleted", () => {
    const comments = [
      ...createThread({
        id: 1,
        isResolved: true,
        deleted: { root: false, replies: [false, false] },
      }),
      ...createThread({
        id: 4,
        isResolved: true,
        deleted: { root: false, replies: [false, false] },
      }),
      ...createThread({
        id: 7,
        deleted: { root: true, replies: [true, true] },
      }),
    ];

    expect(getUnresolvedCount(comments)).toBe(0);
  });
});
