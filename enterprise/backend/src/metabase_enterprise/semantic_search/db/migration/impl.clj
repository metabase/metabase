(ns metabase-enterprise.semantic-search.db.migration.impl
  (:require
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [next.jdbc :as jdbc]))

(def schema-version
  "Version to compare the [[metabase-enterprise.semantic-search.db.migration/db-version]] with. If this is higher,
  schema migration will be performed."
  2)

(defn- drop-all-but-migration-table
  [tx]
  (let [table-names (map (comp first vals)
                         (jdbc/execute! tx
                                        (sql/format
                                         {:select [[:tablename :xi]]
                                          :from [:pg_tables]
                                          :where [:and
                                                  [:<> :schemaname [:inline "information_schema"]]
                                                  [:<> :schemaname [:inline "pg_catalog"]]
                                                  [:<> :tablename  [:inline "migration"]]]})))]
    (doseq [table table-names]
      (jdbc/execute! tx
                     (sql/format
                      {:drop-table  [[[:raw table]]]})))))

(defn migrate-schema!
  "Migrate schema (control, metadata, gate, ...). Migration author is responsible for removing leftovers if necessary
  and in general leaving schema in desired state."
  [tx {:keys [index-metadata] :as _opts}]
  ;; ideally index_table indexed are manipulated in dynamic schema part but for now it does not matter
  (drop-all-but-migration-table tx)
  (semantic.index-metadata/create-tables-if-not-exists! tx index-metadata)
  (semantic.index-metadata/ensure-control-row-exists! tx index-metadata))

(def dynamic-schema-version
  "Code version of dynamic schema (index_table_xyzs). If higher than what's found in db dynamic schema migration will
  be attempted."
  4)

(defn- alter-index-tables!
  "Run `alter-fn` against each existing index table whose `index_version` is below `target-version`, then bump those
   rows' `index_version` to `target-version`. `alter-fn` is `(fn [execute! table-name])`. Tables listed in
   `index_metadata` but missing from the database (e.g. dropped externally) are skipped — leaving the metadata row
   in place to be cleaned up or re-created elsewhere."
  [tx index-metadata target-version alter-fn]
  (let [metadata-table  (keyword (:metadata-table-name index-metadata))
        execute!        (fn [q] (jdbc/execute! tx (sql/format q)))
        candidate-names (->> (execute! {:select-distinct [:table_name]
                                        :from            [metadata-table]
                                        :where           [[:< :index_version target-version]]})
                             (mapcat vals))
        existing-names  (when (seq candidate-names)
                          (->> (execute! {:select [:tablename]
                                          :from   [:pg_tables]
                                          :where  [:in :tablename (vec candidate-names)]})
                               (mapcat vals)
                               set))
        table-names     (filter existing-names candidate-names)]
    (when (seq table-names)
      (doseq [table-name table-names]
        (alter-fn execute! table-name))
      (execute! {:update metadata-table
                 :set    {:index_version target-version}
                 :where  [[:in :table_name (vec table-names)]]}))))

(defn- add-personal-owner-id-column!
  "Migration 2: Add `personal_owner_id` column to index tables for SQL-level personal collection filtering."
  [tx index-metadata]
  (alter-index-tables! tx index-metadata 2
                       (fn [execute! table-name]
                         (execute! {:alter-table [(keyword table-name)]
                                    :add-column  [[:personal_owner_id :int :if-not-exists]]}))))

(defn- add-collection-type-and-data-layer-columns!
  "Migration 3: Add `collection_type` and `data_layer` columns to index tables for the new ranking signals
  (`:library` on `collection_type`; `:data-layer` per-tier weights on `data_layer`)."
  [tx index-metadata]
  (alter-index-tables! tx index-metadata 3
                       (fn [execute! table-name]
                         (execute! {:alter-table [(keyword table-name)]
                                    :add-column  [[:collection_type :text :if-not-exists]]})
                         (execute! {:alter-table [(keyword table-name)]
                                    :add-column  [[:data_layer :text :if-not-exists]]}))))

(defn- add-root-collection-type-column!
  "Migration 4: Add `root_collection_type` column to index tables so the `:library` scorer can match items
  in arbitrarily deep sub-collections of a library tree (the existing `collection_type` only matches the
  direct parent collection)."
  [tx index-metadata]
  (alter-index-tables! tx index-metadata 4
                       (fn [execute! table-name]
                         (execute! {:alter-table [(keyword table-name)]
                                    :add-column  [[:root_collection_type :text :if-not-exists]]}))))

(defn migrate-dynamic-schema!
  "Migrate runtime-managed schema, ie. schema of `index_table_...` tables. Migration author is responsible for removing
  leftovers if necessary."
  [tx {:keys [index-metadata] :as _opts}]
  ;; migration 1: all tables dropped in schema migration in single function call
  ;; migration 2: add personal_owner_id column to index tables
  ;; migration 3: add collection_type and data_layer columns to index tables
  ;; migration 4: add root_collection_type column to index tables
  (add-personal-owner-id-column! tx index-metadata)
  (add-collection-type-and-data-layer-columns! tx index-metadata)
  (add-root-collection-type-column! tx index-metadata))
