(ns metabase-enterprise.serialization.v2.protocols
  (:require
   [potemkin.types :as p]))

(p/defprotocol+ ExportWriter
  "Protocol for serialization export writer."
  (store-entities! [this batch]
    "Store a batch of serialized entities, each `[resolved entity]` with its `resolved` storage path.")
  (store-settings! [this settings]
    "Store accumulated settings as a single settings.yaml entry.")
  (store-log! [this ^bytes content]
    "Store export.log content.")
  (finish! [this]
    "Finalize the backend (e.g. close tar stream). Called after all entities are written."))
