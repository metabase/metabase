(ns metabase.curated-search.mirror
  "OSS entry points for the enterprise pgvector mirror of the `curated_search_entries` table.

  The appdb table is authoritative; the mirror carries one embedding per row and serves the
  `search_curated` Metabot tool's similarity search.
  These `defenterprise` shims route to [[metabase-enterprise.curated-search.core]] when an
  enterprise license with semantic search is present; otherwise they no-op or return empty."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise request-sync!
  "Ask the background sync to reconcile the pgvector mirror with the appdb table soon; no-op in OSS.
  Fire-and-forget: never throws, does no embedding or pgvector work on the calling thread."
  metabase-enterprise.curated-search.core
  []
  nil)

(defenterprise search
  "Similarity-search the curated search index for the saved prompts nearest `user-search-prompt`.
  Returns up to `limit` matches shaped `{:saved_search_prompt :usage_instructions :entity :score}`,
  best blended score first; [] in OSS or when no pgvector store is configured."
  metabase-enterprise.curated-search.core
  [_user-search-prompt _limit]
  [])
