import { getNextId } from "__support__/utils";

import type { Comment, CommentsThread } from "../comments";

import { createMockDocument } from "./document";
import { createMockUser } from "./user";

export function createMockCommentsThread(
  thread: Partial<CommentsThread>,
): CommentsThread {
  return {
    ...thread,

    id: getNextId(),

    entity_type: "document-node",
    entity_id: 1,
    parent_entity_id: 1,

    creator: createMockUser(),
    comments: [],

    is_deleted: false,
    is_resolved: false,

    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export function createMockComment(comment?: Partial<Comment>): Comment {
  return {
    ...comment,

    id: getNextId(),

    document: createMockDocument(),
    creator: createMockUser(),

    is_deleted: false,

    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",

    version: 1,
  };
}
