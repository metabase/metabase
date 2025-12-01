import type { Comment, CommentId } from "metabase-types/api";

export interface CommentThread {
  id: CommentId;
  comments: Comment[];
}
