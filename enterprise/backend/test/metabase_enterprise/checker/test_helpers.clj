(ns metabase-enterprise.checker.test-helpers
  "Shared test helpers for the checker module."
  (:require
   [metabase-enterprise.checker.source :as source]))

(defn make-schema-source
  "Create an in-memory SchemaSource from maps of databases, tables, and fields."
  [{:keys [databases tables fields]}]
  (let [fields-by-table (reduce-kv (fn [m field-path _]
                                     (let [table-path (subvec field-path 0 3)]
                                       (update m table-path (fnil conj #{}) field-path)))
                                   {}
                                   fields)]
    (reify
      source/SchemaSource
      (resolve-database    [_ db-name]    (get databases db-name))
      (resolve-table       [_ table-path] (get tables table-path))
      (resolve-field       [_ field-path] (get fields field-path))
      (fields-for-table    [_ table-path] (get fields-by-table table-path))
      (all-field-paths     [_]            (keys fields))
      (all-database-names  [_]            (keys databases))
      (all-table-paths     [_]            (keys tables))
      (tables-for-database [_ db-name]    (filterv #(= (first %) db-name) (keys tables))))))

(defn make-assets-source
  "Create an in-memory AssetsSource from maps of entities.
   Supports :cards, :snippets, :transforms, :segments, :dashboards,
   :collections, :documents, :measures."
  [{:keys [cards snippets transforms segments dashboards collections documents measures]}]
  (reify
    source/AssetsSource
    (resolve-card       [_ entity-id] (get cards entity-id))
    (resolve-snippet    [_ entity-id] (get snippets entity-id))
    (resolve-transform  [_ entity-id] (get transforms entity-id))
    (resolve-segment    [_ entity-id] (get segments entity-id))
    (resolve-dashboard  [_ entity-id] (get dashboards entity-id))
    (resolve-collection [_ entity-id] (get collections entity-id))
    (resolve-document   [_ entity-id] (get documents entity-id))
    (resolve-measure    [_ entity-id] (get measures entity-id))))

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
  [{:keys [cards snippets transforms segments dashboards collections documents measures]}]
  (cond-> {:card (zipmap (keys cards) (repeat :memory))}
    snippets    (assoc :snippet    (zipmap (keys snippets) (repeat :memory)))
    transforms  (assoc :transform  (zipmap (keys transforms) (repeat :memory)))
    segments    (assoc :segment    (zipmap (keys segments) (repeat :memory)))
    dashboards  (assoc :dashboard  (zipmap (keys dashboards) (repeat :memory)))
    collections (assoc :collection (zipmap (keys collections) (repeat :memory)))
    documents   (assoc :document   (zipmap (keys documents) (repeat :memory)))
    measures    (assoc :measure    (zipmap (keys measures) (repeat :memory)))))

(defn make-sources-and-index
  "Convenience: split an entities map into schema-source, assets-source, and merged index.
   Returns [schema-source assets-source index]."
  [entities]
  [(make-schema-source entities)
   (make-assets-source entities)
   (merge (make-schema-index entities) (make-assets-index entities))])
