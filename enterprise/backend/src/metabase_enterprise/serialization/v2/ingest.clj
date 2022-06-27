(ns metabase-enterprise.serialization.v2.ingest
  "Ingestion is the first step in deserialization - reading from the export format (eg. a tree of YAML files) and
  producing Clojure maps with `:serdes/meta` keys.

  See the detailed description of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require [potemkin.types :as p]))

(p/defprotocol+ Ingestable
  ;; Represents a data source for deserializing previously-exported appdb content into this Metabase instance.
  ;; This is written as a protocol since overriding it with [[reify]] if useful for testing.
  (ingest-list
    [this]
    "Return a reducible stream of meta-maps, one for each entity in the dump.
    See the description of the `:serdes/meta` maps in [[metabase.models.serialization.base]].

    The order is not specified and should not be relied upon!")

  (ingest-one
    [this meta-map]
    "Given one of the meta-maps returned by [[ingest-list]], read in and return the entire corresponding entity."))
