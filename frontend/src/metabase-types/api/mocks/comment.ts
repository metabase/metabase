import { getNextId } from "__support__/utils";

import type { Comment } from "../comments";

import { createMockDocument } from "./document";
import { createMockUser } from "./user";

export function createMockComment(comment?: Partial<Comment>): Comment {
  return {
    ...comment,

    id: getNextId(),
    parent_comment_id: null,

    entity_type: "document",
    entity_id: 1,
    child_entity_id: 1,

    document: createMockDocument(),
    creator: createMockUser(),

    is_deleted: false,
    is_resolved: false,

    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",

    version: 1,
  };
}
