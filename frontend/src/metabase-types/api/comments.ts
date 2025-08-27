import type { DocumentContent } from "./document";
import type { BaseUser } from "./user";

export interface CommentsThread {
  id: number;

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
  id: number;

  document: DocumentContent;
  creator: BaseUser;

  is_deleted: boolean;

  created_at: string;
  updated_at: string;

  version: number;
}

export type CommentHistory = Comment[];
