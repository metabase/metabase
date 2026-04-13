(ns metabase-enterprise.serialization.v2.protocols
  (:require
   [potemkin.types :as p]))

(p/defprotocol+ ExportWriter
  "Protocol for serialization export writer."
  (store-entity! [this entity]
    "Store a single serialized entity. Returns its `:serdes/meta`.")
  (store-settings! [this settings]
    "Store accumulated settings as a single settings.yaml entry.")
  (store-log! [this ^bytes content]
    "Store export.log content.")
  (finish! [this]
    "Finalize the backend (e.g. close tar stream). Called after all entities are written."))
