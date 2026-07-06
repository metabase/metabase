import type { ReactNode } from "react";

import type { Comment, CommentId } from "metabase-types/api";

export interface CommentThread {
  id: CommentId;
  comments: Comment[];
}

/**
 * Controls how the comments UI is laid out.
 *
 * - `sidesheet` (default): threads render as bordered cards with their replies
 *   and a per-thread reply editor always visible. Used by documents.
 * - `sidebar`: a flat, full-width list of comments with the composer pinned to
 *   the bottom. Replies are collapsed behind a toggle and a hover "Reply"
 *   action. Used by explorations.
 */
export type CommentsLayout = "sidesheet" | "sidebar";

export interface CommentExtraRenderer {
  (comment: Comment): ReactNode;
}
