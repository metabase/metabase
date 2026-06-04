(ns metabase.semantic-layer-search.mirror
  "OSS entry points for the enterprise pgvector mirror of the `semantic_layer_index` table.

  The appdb table is authoritative; the mirror carries one embedding per row and serves the
  `semantic_layer_search` Metabot tool's similarity search.
  These `defenterprise` shims route to [[metabase-enterprise.semantic-layer-search.core]] when an
  enterprise license with semantic search is present; otherwise they no-op or return empty."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise request-sync!
  "Ask the background sync to reconcile the pgvector mirror with the appdb table soon; no-op in OSS.
  Fire-and-forget: never throws, does no embedding or pgvector work on the calling thread."
  metabase-enterprise.semantic-layer-search.core
  []
  nil)

(defenterprise search
  "Similarity-search the curated semantic layer for the saved prompts nearest `user-search-prompt`.
  Returns up to `limit` matches shaped `{:saved_search_prompt :usage_instructions :entity :score}`,
  best blended score first; [] in OSS or when no pgvector store is configured."
  metabase-enterprise.semantic-layer-search.core
  [_user-search-prompt _limit]
  [])
