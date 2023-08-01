(ns metabase.metabot.protocols)

(defprotocol Precomputes
  (embeddings [this] [this entity-type entity-id])
  (compa-summary [this entity-type entity-id])
  (update! [this]))

(defprotocol Embedder
  (single [_ string])
  (bulk [_ map-of-string-to-string]))
