(ns metabase-enterprise.embeddings.client
  "Embedding-service RPC for callers outside the search engine.

  This namespace is a thin neutral entry point so consumers like the data-complexity-score's
  synonym axis can request embeddings without taking a transitive dependency on a
  search-prefixed module for what is just an HTTP call to ai-service.

  TODO: relocate the implementation here. Today the provider dispatch + HTTP impls (ollama,
  ai-service, openai) and the embedding-service settings (`ee-embedding-service-base-url`,
  `ee-embedding-service-api-key`, etc.) all live in `metabase-enterprise.semantic-search.*` —
  they predate this namespace because semantic-search was the first consumer.

  Steps for the move:
    1. Migrate the `get-embedding` / `get-embeddings-batch` / `pull-model` defmultis and
       provider impls (currently in `metabase-enterprise.semantic-search.embedding`) into
       `metabase-enterprise.embeddings.*`.
    2. Migrate the embedding-service settings into the same module (or a sibling
       `metabase-enterprise.embeddings.settings` ns).
    3. Decouple the inline token-tracking calls (`semantic.models.token-tracking/record-tokens`,
       `:metabase-search/semantic-embedding-tokens`, the snowplow `track-token-usage!`) — make
       them a hookable callback so callers register their own analytics scope. Semantic-search
       keeps recording its current metrics via that hook; data-complexity-score can opt out or
       register its own.
    4. Flip the dependency: `semantic-search.embedding` becomes a thin re-export from this
       namespace (or goes away entirely once consumers update).
    5. Search-index naming helpers (`abbrev-provider-name`, `abbrev-model-name`,
       `clean-model-name`) and `get-configured-model` / `process-embeddings-streaming` stay in
       semantic-search — they're search-engine-specific."
  (:require
   [metabase-enterprise.semantic-search.core :as semantic-search]))

(set! *warn-on-reflection* true)

(defn get-embeddings-batch
  "Return a sequential collection of embedding vectors, in the same order as the input texts.

  `embedding-model` — `{:provider :model-name :model-dimensions}` map; provider must be one of those registered on
                      [[metabase-enterprise.semantic-search.embedding/get-embeddings-batch]] (`ai-service`, `openai`,
                      `ollama`).
  `texts`           — sequential collection of input strings.
  `opts`            — optional keyword opts (e.g. `:type :doc`). Accepts alternating kwargs or a single trailing map;
                      forwarded as kwargs into the multimethod, which destructures with `& {:as opts}`."
  [embedding-model texts & {:as opts}]
  (apply semantic-search/get-embeddings-batch embedding-model texts (mapcat identity opts)))
