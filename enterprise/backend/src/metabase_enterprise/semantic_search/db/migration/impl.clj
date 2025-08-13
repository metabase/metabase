(ns metabase-enterprise.semantic-search.db.migration.impl
  (:require
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]))

(def code-version
  "Version to compare the [[metabase-enterprise.semantic-search.db.migration/db-version]] with."
  0)

(defn migrate-schema!
  [tx {:keys [index-metadata] :as _opts}]
  (semantic.index-metadata/create-tables-if-not-exists! tx index-metadata)
  (semantic.index-metadata/ensure-control-row-exists! tx index-metadata))

;; TODO: Maybe this will turn out superfluous. Maybe only single code version and migrate fn should be in use.
(def dynamic-code-version 0)

(defn migrate-dynamic-schema!
  "Migrate runtime-managed schema, ie. schema of `index_table_...` tables."
  [_tx {_index-metadata :index-metadata _embedding-model :embedding-model :as _opts}]
  ;; noop!!! atm
  )
