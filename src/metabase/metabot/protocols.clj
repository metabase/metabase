(ns metabase.metabot.protocols)

(defprotocol Precomputes
  (embeddings [this] [this entity-type entity-id])
  (compa-summary [this entity-type entity-id])
  (update! [this]))
