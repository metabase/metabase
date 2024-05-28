import type { NativeQuerySnippet } from "metabase-types/api";

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
  entity_id: "snippet_entity_id",
  archived: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...opts,
});
