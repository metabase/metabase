import type { RegularCollectionId } from "./collection";
import type { UserId, UserInfo } from "./user";

export type NativeQuerySnippetId = number;

export interface NativeQuerySnippet {
  id: NativeQuerySnippetId;
  name: string;
  description: string | null;
  content: string;
  collection_id: RegularCollectionId | null;
  creator_id: UserId;
  creator: UserInfo;
  archived: boolean;
  entity_id: string;
  created_at: string;
  updated_at: string;
}

export interface ListSnippetsParams {
  archived?: boolean;
}

export interface CreateSnippetRequest {
  content: string;
  name: string;
  description?: string;
  collection_id?: RegularCollectionId | null;
}

export interface UpdateSnippetRequest {
  id: NativeQuerySnippetId;
  archived?: boolean;
  content?: string | null;
  name?: string | null;
  description?: string | null;
  collection_id?: RegularCollectionId | null;
}
