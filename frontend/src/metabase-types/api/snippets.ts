import type { Collection, RegularCollectionId } from "./collection";
import type { TemplateTags } from "./dataset";
import type { BaseEntityId } from "./entity-id";
import type { UserId, UserInfo } from "./user";
import type { WorktreeId } from "./worktree";

export type NativeQuerySnippetId = number;

export interface NativeQuerySnippet {
  id: NativeQuerySnippetId;
  name: string;
  description: string | null;
  content: string;
  template_tags: TemplateTags | null;
  collection_id: RegularCollectionId | null;
  creator_id: UserId;
  archived: boolean;
  entity_id: BaseEntityId;
  created_at: string;
  updated_at: string;
  worktree_id?: WorktreeId | null;

  creator?: UserInfo;
  collection?: Collection;
}

export type ListSnippetsParams = {
  archived?: boolean;
  "worktree-id"?: WorktreeId | null;
};

export interface CreateSnippetRequest {
  name: string;
  content: string;
  description?: string | null;
  collection_id?: RegularCollectionId | null;
  worktree_id?: WorktreeId | null;
}

export interface UpdateSnippetRequest {
  id: NativeQuerySnippetId;
  name?: string;
  description?: string | null;
  content?: string;
  collection_id?: RegularCollectionId | null;
  archived?: boolean;
}
