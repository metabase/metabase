(ns metabase-enterprise.semantic-search.db.migration.impl
  (:require
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]))

(def schema-version
  "Version to compare the [[metabase-enterprise.semantic-search.db.migration/db-version]] with. If this is higher,
  schema migration will be performed."
  0)

(defn migrate-schema!
  [tx {:keys [index-metadata] :as _opts}]
  (semantic.index-metadata/drop-tables-if-exists! tx index-metadata)
  (semantic.index-metadata/create-tables-if-not-exists! tx index-metadata)
  (semantic.index-metadata/ensure-control-row-exists! tx index-metadata))

(def dynamic-schema-version
  "Code version of dynamic schema (index_table_xyzs). If higher than what's found in db dynamic schema migration will
  be attempted."
  0)

(defn migrate-dynamic-schema!
  "Migrate runtime-managed schema, ie. schema of `index_table_...` tables."
  [_tx {_index-metadata :index-metadata _embedding-model :embedding-model :as _opts}]
  ;; noop!!! atm
  )
