(ns metabase-enterprise.checker.test-helpers
  "Shared test helpers for the checker module."
  (:require
   [metabase-enterprise.checker.source :as source]))

(defn make-schema-source
  "Create an in-memory SchemaSource from maps of databases, tables, and fields."
  [{:keys [databases tables fields]}]
  (reify
    source/SchemaSource
    (resolve-database [_ db-name]    (get databases db-name))
    (resolve-table    [_ table-path] (get tables table-path))
    (resolve-field    [_ field-path] (get fields field-path))))

(defn make-assets-source
  "Create an in-memory AssetsSource from maps of cards, snippets, transforms, and segments."
  [{:keys [cards snippets transforms segments]}]
  (reify
    source/AssetsSource
    (resolve-card      [_ entity-id] (get cards entity-id))
    (resolve-snippet   [_ entity-id] (get snippets entity-id))
    (resolve-transform [_ entity-id] (get transforms entity-id))
    (resolve-segment   [_ entity-id] (get segments entity-id))))

(defn make-schema-index
  "Create a file index for an in-memory schema source.
   Values are :memory since resolution goes through the source, not files."
  [{:keys [databases tables fields]}]
  {:database (zipmap (keys databases) (repeat :memory))
   :table    (zipmap (keys tables) (repeat :memory))
   :field    (zipmap (keys fields) (repeat :memory))})

(defn make-assets-index
  "Create a file index for an in-memory assets source.
   Values are :memory since resolution goes through the source, not files."
  [{:keys [cards snippets transforms segments]}]
  (cond-> {:card (zipmap (keys cards) (repeat :memory))}
    snippets   (assoc :snippet   (zipmap (keys snippets) (repeat :memory)))
    transforms (assoc :transform (zipmap (keys transforms) (repeat :memory)))
    segments   (assoc :segment   (zipmap (keys segments) (repeat :memory)))))

(defn make-sources-and-index
  "Convenience: split an entities map into schema-source, assets-source, and merged index.
   `entities` has :databases, :tables, :fields, :cards, and optionally
   :snippets, :transforms, :segments.
   Returns [schema-source assets-source index]."
  [entities]
  [(make-schema-source entities)
   (make-assets-source entities)
   (merge (make-schema-index entities) (make-assets-index entities))])
