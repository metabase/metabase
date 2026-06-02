(ns metabase.metabot.prompt-entities
  "OSS entry points for the pgvector-backed search-prompt-entities mirror and similarity search.

   The appdb `search_prompt_entities` table is authoritative; enterprise mirrors each row into a
   pgvector companion table and serves the similarity search from it (see
   [[metabase-enterprise.metabot.prompt-entities]]). These `defenterprise` shims let the OSS model
   hooks and the `search_prompt_entities` tool call across the boundary: with an enterprise license
   and semantic search they route to the EE impl; otherwise they no-op / return empty."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise upsert-prompt-entity!
  "Mirror a saved search prompt into the pgvector store (enterprise). No-op in OSS."
  metabase-enterprise.metabot.prompt-entities
  [_id _search-prompt _entities _verified _canonical?]
  nil)

(defenterprise delete-prompt-entity!
  "Remove a saved search prompt's pgvector row (enterprise). No-op in OSS."
  metabase-enterprise.metabot.prompt-entities
  [_id]
  nil)

(defenterprise search-prompt-entities
  "Similarity-search saved prompts in the pgvector store (enterprise). Returns [] in OSS."
  metabase-enterprise.metabot.prompt-entities
  [_user-search-prompt _limit]
  [])
