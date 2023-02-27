(ns metabase.lib.metadata
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(def FieldMetadata
  "Malli schema for a valid map of Field metadata."
  [:map
   [:lib/type [:= :metadata/field]]
   [:id {:optional true} ::lib.schema.id/field]
   [:name ::lib.schema.common/non-blank-string]])

(def ^:private TableMetadata
  [:map
   [:lib/type [:= :metadata/table]]
   [:id ::lib.schema.id/table]
   [:name ::lib.schema.common/non-blank-string]
   [:schema ::lib.schema.common/non-blank-string]
   [:fields [:sequential FieldMetadata]]])

(def DatabaseMetadata
  "Malli schema for the DatabaseMetadata as returned by `GET /api/database/:id/metadata` -- what should be available to
  the frontend Query Builder."
  [:map
   [:lib/type [:= :metadata/database]]
   [:id ::lib.schema.id/database]
   [:tables [:sequential TableMetadata]]])

(def StageMetadata
  "Malli schema for the results metadata (`[:data :results_metadata]`) that is included in query results, and saved as
  `result_metadata` for a Saved Question.

  Note that queries currently actually come back with both `data.results_metadata` AND `data.cols`; it looks like the
  Frontend actually *merges* these together -- see `applyMetadataDiff` in
  `frontend/src/metabase/query_builder/selectors.js` -- but this is ridiculous. Let's try to merge anything missing in
  `results_metadata` into `cols` going forward so things don't need to be manually merged in the future."
  [:map
   [:lib/type [:= :metadata/results]]
   [:columns [:sequential FieldMetadata]]])

(defmulti ^:private database-metadata*
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod database-metadata* :mbql/query
  [query]
  (:lib/metadata query))

(mu/defn database-metadata :- [:maybe DatabaseMetadata]
  "Fetch Database metadata from something, e.g. an 'outer' MBQL query. Returns `nil` if not metadata is available."
  [x]
  (database-metadata* x))

(defmulti ^:private table-metadata*
  "Implementation for [[table-metadata]]."
  {:arglists '([metadata table-name-or-id])}
  (fn [metadata _table-name-or-id]
    (lib.dispatch/dispatch-value metadata)))

(defmethod table-metadata* :metadata/database
  [database-metadata table-name-or-id]
  (some (if (integer? table-name-or-id)
          (fn [table]
            (when (= (:id table) table-name-or-id)
              table))
          (fn [table]
            (when (= (:name table) table-name-or-id)
              table)))
        (:tables database-metadata)))

(defmethod table-metadata* :mbql/query
  [query table-name-or-id]
  (table-metadata* (:lib/metadata query) table-name-or-id))

(mu/defn table-metadata :- TableMetadata
  "Get metadata for a specific Table from some `metadata` source (probably Database metadata).

  Returns `nil` if no matching Metadata could be found."
  [metadata table]
  (or (table-metadata* metadata table)
      (throw (ex-info (i18n/tru "Could not resolve Table {0}" (pr-str table))
                      {:metadata metadata
                       :table    table}))))

;;; TODO -- consider whether this should dispatch on Field type as well so it's easier to write different
;;; implementations for Field IDs vs String names vs Keywords etc

(defmulti ^:private field-metadata*
  "Implementation for [[field-metadata]]."
  {:arglists '([metadata table field])}
  (fn [metadata _table _field]
    (lib.dispatch/dispatch-value metadata)))

(defmethod field-metadata* :metadata/database
  [database-metadata table-name-or-id field]
  (assert (some? table-name-or-id)
          (i18n/tru "Table name or ID is required to fetch a Field from Database metadata"))
  (field-metadata* (table-metadata database-metadata table-name-or-id) nil field))

(defmethod field-metadata* :metadata/table
  [table-metadata _table field-id-or-name]
  (or (some (if (integer? field-id-or-name)
              (fn [field]
                (when (= (:id field) field-id-or-name)
                  field))
              (fn [field]
                (when (= (:name field) field-id-or-name)
                  field)))
            (:fields table-metadata))
      ;;; TODO -- not sure it makes sense this that would throw an error while [[field-metadata]] is currently allowed
      ;;; to return `nil`, and while the other implementations of this do not
      (throw (ex-info (i18n/tru "Could not find Field {0} in Table {1}"
                                (pr-str field-id-or-name)
                                (pr-str (:name table-metadata)))
                      {:metadata table-metadata
                       :field    field-id-or-name}))))

;;; TODO -- should this throw an error?
(defmethod field-metadata* :metadata/results
  [results-metadata _table field-id-or-name]
  (some (if (integer? field-id-or-name)
          (fn [field]
            (when (= (:id field) field-id-or-name)
              field))
          (fn [field]
            (when (= (:name field) field-id-or-name)
              field)))
        (:columns results-metadata)))

(defmethod field-metadata* :mbql/query
  [query table field]
  (field-metadata* (:lib/metadata query) table field))

;;; TODO -- a little weird that this can return `nil` but [[table-metadata]] can't... but we have real cases where it
;;; makes sense that this might return `nil`, unlike for Tables

;;; TODO -- what about nested Fields??
(mu/defn field-metadata :- [:maybe FieldMetadata]
  "Get metadata for a specific Field from some `metadata` source, which might be Database metadata, Table metadata, or
  source query/results metadata. `table` is optional; if you specify it and pass Database metadata,
  this will first find the appropriate [[table-metadata]] for that Table, then find the Field metadata in that Table
  metadata.

  Returns `nil` if no matching metadata could be found."
  ([metadata :- [:map
                 [:lib/type [:keyword]]]
    field    :- [:or ::lib.schema.common/non-blank-string ::lib.schema.id/field]]
   (field-metadata metadata nil field))

  ([metadata  :- [:map
                  [:lib/type [:keyword]]]
    table     :- [:maybe [:or ::lib.schema.common/non-blank-string ::lib.schema.id/table]]
    field     :- [:or ::lib.schema.common/non-blank-string ::lib.schema.id/field]]
   (field-metadata* metadata table field)))

;;; TODO -- this should probably be guaranteed to never return `nil`
(mu/defn stage-metadata :- [:maybe StageMetadata]
  "Fetch the stage metadata for a specific `stage-number` of a `query`."
  [query stage-number :- :int]
  ;; TODO -- is there any situation where we'd want to do something different? i.e. should we have a `stage-metadata*`
  ;; method
  (:lib/stage-metadata (lib.util/query-stage query stage-number)))
