import type { DocumentContent } from "./document";
import type { BaseUser } from "./user";

export type CommentId = number;

export type CommentThreadId = number;

export type CommentEntityType = "document-node";

export type EntityId = string | number;

export interface CommentThread {
  id: CommentThreadId;

  entity_type: CommentEntityType;
  entity_id: EntityId;
  parent_entity_id: EntityId | null;

  creator: BaseUser;
  comments: Comment[];

  is_deleted: boolean;
  is_resolved: boolean;

  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: CommentId;

  document: DocumentContent;
  creator: BaseUser;

  is_deleted: boolean;

  created_at: string;
  updated_at: string;

  version: number;
}

export type CommentHistory = Comment[];

/** request types below */

export interface ListCommentsRequest {
  entity_type: CommentEntityType;
  entity_id: EntityId;
  parent_entity_id?: EntityId;
}

export interface CreateCommentThreadRequest {
  entity_id: EntityId;
  entity_type: CommentEntityType;
  parent_entity_id?: EntityId;
  document: DocumentContent;
}

export interface CreateCommentRequest {
  thread_id: CommentThreadId;
  document: DocumentContent;
}

export interface UpdateCommentRequest {
  thread_id: CommentThreadId;
  comment_id: CommentId;
  document: DocumentContent;
}

export interface GetCommentHistoryRequest {
  thread_id: CommentThreadId;
  comment_id: CommentId;
}
