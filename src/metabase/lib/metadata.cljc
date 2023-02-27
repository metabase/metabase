(ns metabase.lib.metadata
  "TODO -- should this just be part of [[metabase.lib.interface]]?"
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(def ^:private FieldMetadata
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

;;; or should this be called ResultsMetadata?
(def SourceQueryMetadata
  "Malli schema for the results metadata (`[:data :results_metadata]`) that is included in query results, and saved as
  `result_metadata` for a Saved Question.

  Note that queries currently actually come back with both `data.results_metadata` AND `data.cols`; it looks like the
  Frontend actually *merges* these together -- see `applyMetadataDiff` in
  `frontend/src/metabase/query_builder/selectors.js` -- but this is ridiculous. Let's try to merge anything missing in
  `results_metadata` into `cols` going forward so things don't need to be manually merged in the future."
  [:map
   [:lib/type [:= :metadata/results]]
   [:columns [:sequential FieldMetadata]]])

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
  "Get metadata for a specific Table from some `metadata` source (probably Database metadata)."
  [metadata         :- [:map
                        [:lib/type [:keyword]]]
   table-name-or-id :- [:or
                        ::lib.schema.id/table
                        ::lib.schema.common/non-blank-string]]
  (table-metadata* metadata table-name-or-id))

(defmulti ^:private field-metadata*
  "Implementation for [[field-metadata]]."
  {:arglists '([metadata table-name-or-id-or-nil field-name-or-id])}
  (fn [metadata _table-name-or-id-or-nil _field-name-or-id]
    (lib.dispatch/dispatch-value metadata)))

;; NOCOMMIT
(defmethod field-metadata* :default
  [metadata table field]
  (throw (ex-info (i18n/tru "Don''t know how to get metadata for Field {0} from {1}"
                            (pr-str (if table
                                      (str table \. field)
                                      field))
                            (pr-str metadata))
                  {:table table, :field field, :metadata metadata})))

(defmethod field-metadata* :metadata/database
  [database-metadata table-name-or-id field-name-or-id]
  (assert (some? table-name-or-id)
          (i18n/tru "Table name or ID is required to fetch a Field from Database metadata"))
  (field-metadata* (table-metadata database-metadata table-name-or-id) nil field-name-or-id))

(defmethod field-metadata* :metadata/table
  [table-metadata _table field-name-or-id]
  (or (some (if (integer? field-name-or-id)
              (fn [field]
                (when (= (:id field) field-name-or-id)
                  field))
              (fn [field]
                (when (= (:name field) field-name-or-id)
                  field)))
            (:fields table-metadata))
      (throw (ex-info (i18n/tru "Could not find Field {0} in Table {1}"
                                (pr-str field-name-or-id)
                                (pr-str (:name table-metadata)))
                      {:metadata table-metadata
                       :field    field-name-or-id}))))

(defmethod field-metadata* :metadata/results
  [results-metadata _table field-name-or-id]
  (or (some (if (integer? field-name-or-id)
              (fn [field]
                (when (= (:id field) field-name-or-id)
                  field))
              (fn [field]
                (when (= (:name field) field-name-or-id)
                  field)))
            (:columns results-metadata))
      (throw (ex-info (i18n/tru "Could not find Field {0} in results metadata"
                                (pr-str field-name-or-id))
                      {:metadata results-metadata
                       :field    field-name-or-id}))))

(defmethod field-metadata* :mbql/query
  [query table-name-or-id-or-nil field-name-or-id]
  (field-metadata* (:lib/metadata query) table-name-or-id-or-nil field-name-or-id))

;; TODO -- what about nested Fields??
(mu/defn field-metadata :- FieldMetadata
  "Get metadata for a specific Field from some `metadata` source, which might be Database metadata, Table metadata, or
  source query/results metadata. `table-name-or-id-or-nil` is optional; if you specify it and pass Database metadata,
  this will first find the appropriate [[table-metadata]] for that Table, then find the Field metadata in that Table
  metadata."
  ([metadata         :- [:map
                         [:lib/type [:keyword]]]
    field-name-or-id :- [:or ::lib.schema.common/non-blank-string ::lib.schema.id/field]]
   (field-metadata metadata nil field-name-or-id))

  ([metadata                :- [:map
                                [:lib/type [:keyword]]]
    table-name-or-id-or-nil :- [:maybe [:or ::lib.schema.common/non-blank-string ::lib.schema.id/table]]
    field-name-or-id        :- [:or ::lib.schema.common/non-blank-string ::lib.schema.id/field]]
   (field-metadata* metadata table-name-or-id-or-nil field-name-or-id)))
