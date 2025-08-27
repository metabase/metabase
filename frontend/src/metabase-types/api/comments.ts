import type { DocumentContent } from "./document";
import type { BaseUser } from "./user";

export type CommentId = number;

export type CommentsThreadId = number;

export interface CommentsThread {
  id: CommentsThreadId;

  entity_type: "document-node";
  entity_id: string | number;
  parent_entity_id: string | number | null;

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
