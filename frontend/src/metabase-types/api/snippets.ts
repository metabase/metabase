import { RegularCollectionId } from "./collection";
import { User, UserId } from "./user";

export interface NativeQuerySnippet {
  id: number;
  name: string;
  description: string | null;
  content: string;
  collection_id: RegularCollectionId | null;
  creator_id: UserId;
  creator: User;
  archived: boolean;
  entity_id: string;
  created_at: string;
  updated_at: string;
}
