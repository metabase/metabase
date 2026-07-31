import type { Collection, RegularCollectionId } from "./collection";
import type { TemplateTags } from "./dataset";
import type { BaseEntityId } from "./entity-id";
import type { RemoteSyncWorktreeId } from "./remote-sync";
import type { UserId, UserInfo } from "./user";

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

  creator?: UserInfo;
  collection?: Collection;
}

export type ListSnippetsParams = {
  archived?: boolean;
  /** Return only the given remote-sync worktree's snippets. */
  "worktree-id"?: RemoteSyncWorktreeId;
};

export interface CreateSnippetRequest {
  name: string;
  content: string;
  description?: string | null;
  collection_id?: RegularCollectionId | null;
  /** With a collection_id the collection's worktree always wins; pass only for a worktree-root snippet. */
  worktree_id?: RemoteSyncWorktreeId | null;
}

export interface UpdateSnippetRequest {
  id: NativeQuerySnippetId;
  name?: string;
  description?: string | null;
  content?: string;
  collection_id?: RegularCollectionId | null;
  archived?: boolean;
}
