(ns metabase-enterprise.embeddings.client
  "Embedding-service RPC for callers outside the search engine.

  The provider dispatch + HTTP impls + token tracking still live in
  [[metabase-enterprise.semantic-search.embedding]] — they were the first consumer and the
  semantic-search-specific analytics are tangled in. This namespace is a thin neutral entry
  point so consumers like the data-complexity-score's synonym axis can request embeddings
  without taking a transitive dependency on a search-prefixed module for what is just an
  HTTP call to ai-service.

  When the deeper refactor happens — moving the impl + settings into a non-search module
  with token tracking as a hookable callback — this namespace becomes the canonical home and
  semantic-search re-exports from here instead of the other way around."
  (:require
   [metabase-enterprise.semantic-search.embedding :as ss.embedding]))

(set! *warn-on-reflection* true)

(defn get-embeddings-batch
  "Return a sequential collection of embedding vectors, in the same order as the input texts.

  `embedding-model` — `{:provider :model-name :model-dimensions}` map; provider must be one
                      of the providers registered on
                      [[metabase-enterprise.semantic-search.embedding/get-embeddings-batch]]
                      (currently `ai-service`, `openai`, `ollama`).
  `texts`           — sequential collection of input strings.
  `opts`            — keyword opts forwarded to the underlying multimethod (e.g. `:type`)."
  [embedding-model texts & opts]
  (apply ss.embedding/get-embeddings-batch embedding-model texts opts))
