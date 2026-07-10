import type { DocumentContent } from "./document";
import type { BaseUser, User, UserId } from "./user";

export type CommentId = number;

export type CommentEntityType = "document" | "exploration";

export type EntityId = string | number;

export type CommentContext = Record<string, unknown>;

export interface Comment {
  id: CommentId;
  parent_comment_id: CommentId | null;

  target_type: CommentEntityType;
  target_id: EntityId;
  child_target_id: string | null;

  creator: BaseUser;
  content: DocumentContent;

  deleted_at: string | null;
  is_resolved: boolean;

  created_at: string;
  updated_at: string;

  reactions: CommentReaction[];

  version: number;
  context?: CommentContext | null;
}

export interface CommentReaction {
  emoji: string;
  count: number;
  users: { id: UserId; name: string }[];
}

export type MentionableUser = Pick<
  User,
  "id" | "common_name" | "first_name" | "last_name"
>;

export interface CommentTarget {
  target_id: EntityId;
  target_type: CommentEntityType;
}

/** request types below */

export interface ListCommentsRequest {
  target_type: CommentEntityType;
  target_id: EntityId;
}

export interface CreateCommentRequest {
  target_id: EntityId;
  target_type: CommentEntityType;
  child_target_id: string | null;
  parent_comment_id: CommentId | null;
  content: DocumentContent;
  context?: CommentContext | null;
}

export interface UpdateCommentRequest {
  id: CommentId;
  content?: DocumentContent;
  is_resolved?: boolean;
}

export interface CreateReactionRequest {
  id: CommentId;
  emoji: string;
}

export interface DeleteReactionRequest {
  id: CommentId;
}

export interface ListMentionsRequest {
  limit: number;
}
