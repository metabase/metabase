(ns metabase.metabot.prompt-entities
  "OSS entry points for the pgvector-backed search-prompt-entities mirror and similarity search.

  These `defenterprise` shims let the OSS model hooks and the `search_prompt_entities` tool call across
  the boundary to [[metabase-enterprise.metabot.prompt-entities]].
  With an enterprise license and semantic search they route to the EE impl; otherwise they no-op or
  return empty."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise upsert-prompt-entity!
  "Mirror a saved search prompt into the pgvector store; no-op in OSS."
  metabase-enterprise.metabot.prompt-entities
  [_id _search-prompt _usage-instructions _entities _verified _canonical?]
  nil)

(defenterprise delete-prompt-entity!
  "Remove a saved search prompt's pgvector row; no-op in OSS."
  metabase-enterprise.metabot.prompt-entities
  [_id]
  nil)

(defenterprise search-prompt-entities
  "Similarity-search saved prompts in the pgvector store; returns [] in OSS."
  metabase-enterprise.metabot.prompt-entities
  [_user-search-prompt _limit]
  [])
