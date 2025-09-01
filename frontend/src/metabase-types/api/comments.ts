import type { DocumentContent } from "./document";
import type { BaseUser } from "./user";

export type CommentId = number;

export type CommentEntityType = "document";

export type EntityId = string | number;

export interface Comment {
  id: CommentId;
  parent_comment_id: CommentId | null;

  target_type: CommentEntityType;
  target_id: EntityId;
  child_target_id: EntityId | null;

  creator: BaseUser;
  content: DocumentContent;

  is_deleted: boolean;
  is_resolved: boolean;

  created_at: string;
  updated_at: string;

  version: number;
}

/** request types below */

export interface ListCommentsRequest {
  target_type: CommentEntityType;
  target_id: EntityId;
}

export interface CreateCommentRequest {
  target_id: EntityId;
  target_type: CommentEntityType;
  child_target_id: EntityId | null;
  parent_comment_id: CommentId | null;
  content: DocumentContent;
}

export interface UpdateCommentRequest {
  id: CommentId;
  content?: DocumentContent;
  is_deleted?: boolean;
  is_resolved?: boolean;
}
