import type { DocumentContent } from "./document";
import type { BaseUser } from "./user";

export type CommentId = number;

export type CommentEntityType = "document";

export type EntityId = string | number;

export interface Comment {
  id: CommentId;
  parent_comment_id: CommentId | null;

  entity_type: CommentEntityType;
  entity_id: EntityId;
  child_entity_id: EntityId | null;

  creator: BaseUser;
  document: DocumentContent;

  is_deleted: boolean;
  is_resolved: boolean;

  created_at: string;
  updated_at: string;

  version: number;
}

export type CommentHistory = Comment[];

/** request types below */

export interface ListCommentsRequest {
  entity_type: CommentEntityType;
  entity_id: EntityId;
}

export interface CreateCommentRequest {
  entity_id: EntityId;
  entity_type: CommentEntityType;
  child_entity_id: EntityId | null;
  parent_comment_id: CommentId | null;
  document: DocumentContent;
}

export interface UpdateCommentRequest {
  id: CommentId;
  document?: DocumentContent;
  is_deleted?: boolean;
  is_resolved?: boolean;
}
