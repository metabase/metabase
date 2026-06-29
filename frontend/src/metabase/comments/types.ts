import type { ReactNode } from "react";

import type { Comment, CommentId } from "metabase-types/api";

export interface CommentThread {
  id: CommentId;
  comments: Comment[];
}

export interface CommentExtraRenderer {
  (comment: Comment): ReactNode;
}
