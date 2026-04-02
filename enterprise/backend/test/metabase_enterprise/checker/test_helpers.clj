(ns metabase-enterprise.checker.test-helpers
  "Shared test helpers for the checker module."
  (:require
   [metabase-enterprise.checker.source :as source]))

(defn make-memory-source
  "Create an in-memory MetadataSource from a map of entities.
   `entities` is a map with :databases, :tables, :fields, :cards."
  [{:keys [databases tables fields cards]}]
  (reify
    source/MetadataSource
    (resolve-database [_ db-name] (get databases db-name))
    (resolve-table [_ table-path] (get tables table-path))
    (resolve-field [_ field-path] (get fields field-path))
    (resolve-card [_ entity-id] (get cards entity-id))))

(defn make-memory-index
  "Create a file index for an in-memory source.
   Values are :memory since resolution goes through the source, not files."
  [{:keys [databases tables fields cards]}]
  {:database (zipmap (keys databases) (repeat :memory))
   :table    (zipmap (keys tables) (repeat :memory))
   :field    (zipmap (keys fields) (repeat :memory))
   :card     (zipmap (keys cards) (repeat :memory))})
