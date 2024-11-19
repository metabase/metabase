import type { NativeQuerySnippet } from "metabase-types/api";

import { createMockEntityId } from "./entity-id";
import { createMockUser } from "./user";

export const createMockNativeQuerySnippet = ({
  creator = createMockUser(),
  creator_id = creator.id,
  ...opts
}: Partial<NativeQuerySnippet> = {}): NativeQuerySnippet => ({
  id: 1,
  name: "My Snippet",
  description: null,
  content: "SELECT * FROM my_table",
  collection_id: null,
  creator,
  creator_id,
  entity_id: createMockEntityId(),
  archived: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
});
