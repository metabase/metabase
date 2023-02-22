(ns metabase-enterprise.serialization.v2.storage
  "A multimethod entry point for storage sinks. Storage is the second phase of serialization.
  See [[metabase.models.serialization.base]] for detailed documentation of the serialization process.
  Implementations of storage should live in [[metabase-enterprise.serialization.v2.storage.yaml]] and similar.")

(defmulti store-all!
  "`(store-all! stream opts)`
  `stream` is a reducible stream of portable maps with `:serdes/meta` keys.
  `opts` is a map of options, such as the path to the root directory.

  See [[metabase.models.serialization.base]] for detailed documentation of the serialization process, and the maps in
  the stream.

  Keyed on the only required key in `opts`: `{:storage/target ...}`."
  (fn [_ {target :storage/target}] target))
