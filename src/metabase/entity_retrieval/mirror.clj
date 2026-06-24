(ns metabase.entity-retrieval.mirror
  "OSS entry points for the enterprise pgvector `library_entity_index`.

  The appdb (`osi_ai_context` + library membership) is authoritative; the index carries one embedding
  per value-document and serves the `retrieve_library_entities` Metabot tool's similarity search.
  These `defenterprise` shims route to [[metabase-enterprise.entity-retrieval.core]] when an enterprise
  license with semantic search is present; otherwise they no-op or return empty."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise request-sync!
  "Ask the background sync to reconcile the pgvector index with the appdb soon; no-op in OSS.
  Fire-and-forget: never throws, does no embedding or pgvector work on the calling thread."
  metabase-enterprise.entity-retrieval.core
  []
  nil)

(defenterprise search
  "Similarity-search the library entity index for the documents nearest `user-search-prompt`.
  Returns up to `limit` matches shaped `{:entity {:model :id} :doc_type :doc_text :score}`,
  best score first; [] in OSS or when no pgvector store is configured."
  metabase-enterprise.entity-retrieval.core
  [_user-search-prompt _limit]
  [])
