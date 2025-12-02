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
  1)

(defn migrate-dynamic-schema!
  "Migrate runtime-managed schema, ie. schema of `index_table_...` tables. Migration author is responsible for removing
  leftovers if necessary."
  [_tx {_index-metadata :index-metadata _embedding-model :embedding-model :as _opts}]
  ;; migration 1: all tables dropped in schema migration in single function call
  )
