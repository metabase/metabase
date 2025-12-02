import { getNextId } from "__support__/utils";

import type { Comment } from "../comments";

import { createMockDocumentContent } from "./document";
import { createMockUser } from "./user";

export function createMockComment(comment?: Partial<Comment>): Comment {
  return {
    ...comment,

    id: getNextId(),
    parent_comment_id: null,

    target_type: "document",
    target_id: 1,
    child_target_id: 1,

    creator: createMockUser(),
    content: createMockDocumentContent(),

    deleted_at: null,
    is_resolved: false,

    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",

    reactions: [],

    version: 1,
  };
}
