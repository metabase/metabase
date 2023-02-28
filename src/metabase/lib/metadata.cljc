(ns metabase.lib.metadata
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(def FieldMetadata
  "Malli schema for a valid map of Field metadata."
  [:map
   [:lib/type [:= :metadata/field]]
   [:id {:optional true} ::lib.schema.id/field]
   [:name ::lib.schema.common/non-blank-string]
   [:field_ref {:optional true} ::lib.schema.ref/ref]])

(def TableMetadata
  "Malli schema for a valid map of Table metadata."
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
  `result_metadata` for a Saved Question, or for the calculated metadata for any stage of the query.

  Note that queries currently actually come back with both `data.results_metadata` AND `data.cols`; it looks like the
  Frontend actually *merges* these together -- see `applyMetadataDiff` in
  `frontend/src/metabase/query_builder/selectors.js` -- but this is ridiculous. Let's try to merge anything missing in
  `results_metadata` into `cols` going forward so things don't need to be manually merged in the future."
  [:map
   [:lib/type [:= :metadata/stage]]
   [:columns [:sequential FieldMetadata]]])

(defmulti ^:private ->database-metadata
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->database-metadata :mbql/query
  [query]
  (:lib/metadata query))

(mu/defn database-metadata :- [:maybe DatabaseMetadata]
  "Fetch Database metadata from something, e.g. an 'outer' MBQL query. Returns `nil` if not metadata is available."
  [x]
  (->database-metadata x))

(defmulti ^:private ->stage-metadata
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod ->stage-metadata :metadata/stage
  [m]
  m)

(defmethod ->stage-metadata :type/sequence
  [columns]
  {:lib/type :metadata/stage
   :columns  (mapv (fn [field-metadata]
                     (cond-> field-metadata
                       (:field_ref field-metadata) (update :field_ref lib.options/ensure-uuid)))
                   columns)})

(defmethod ->stage-metadata :mbql.stage/mbql
  [stage]
  (some-> stage :lib/stage-metadata ->stage-metadata))

(defmethod ->stage-metadata :mbql.stage/native
  [stage]
  (some-> stage :lib/stage-metadata ->stage-metadata))

(mu/defn stage-metadata :- [:maybe StageMetadata]
  "1 arity: coerce something, such as a sequence of columns, to a proper [[StageMetadata]] map. 2 arity: fetch stage
  metadata for a specific `stage-number` of a `query`."
  ([x]
   (some-> x ->stage-metadata))

  ([query        :- [:map [:type [:= :pipeline]]]
    stage-number :- :int]
   (stage-metadata (:lib/stage-metadata (lib.util/query-stage query stage-number)))))

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
  (or (some-> (table-metadata* metadata table)
              (update :fields (fn [fields]
                                (mapv (fn [field-metadata]
                                        (cond-> field-metadata
                                          (:field_ref field-metadata)
                                          (update :field_ref lib.options/ensure-uuid)))
                                      fields))))
      (throw (ex-info (i18n/tru "Could not resolve Table {0}" (pr-str table))
                      {:metadata metadata
                       :table    table}))))

(defmulti ^:private matching-field*
  {:arglists '([field-metadatas field])}
  (fn [_field-metadatas field]
    (lib.dispatch/dispatch-value field)))

(defmethod matching-field* :type/string
  [field-metadatas field-name]
  (some (fn [field]
          (when (= (:name field) field-name)
            field))
        field-metadatas))

(defmethod matching-field* :type/integer
  [field-metadatas field-id]
  (some (fn [field]
          (when (= (:id field) field-id)
            field))
        field-metadatas))

(defmethod matching-field* :field
  [field-metadatas [_field id-or-name]]
  (matching-field* field-metadatas id-or-name))

(defn- matching-field [field-metadatas field]
  (let [metadata (matching-field* field-metadatas field)]
    (cond-> metadata
      (:field_ref metadata) (update :field_ref lib.options/ensure-uuid))))

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
  [table-metadata _table field]
  (or (matching-field (:fields table-metadata) field)
      ;;; TODO -- not sure it makes sense this that would throw an error while [[field-metadata]] is currently allowed
      ;;; to return `nil`, and while the other implementations of this do not
      (throw (ex-info (i18n/tru "Could not find Field {0} in Table {1}"
                                (pr-str field)
                                (pr-str (:name table-metadata)))
                      {:metadata table-metadata
                       :field    field}))))

(defmethod field-metadata* :type/sequence
  [field-metadatas _table field]
  (matching-field field-metadatas field))

;;; TODO -- should this throw an error?
(defmethod field-metadata* :metadata/stage
  [stage-metadata _table field]
  (matching-field (:columns stage-metadata) field))

(defn- field-metadata-for-stage [query stage-number table field]
  (letfn [(field* [metadata]
            (when metadata
              (field-metadata* metadata table field)))]
    (or
     ;;; ignore stage metadata if Table is specified. This is probably wrong -- what about joined Fields? But it's ok
     ;;; for now
     (when-not table
       (or
        ;; resolve field from the current stage
        (field* (stage-metadata query stage-number))
        ;; resolve field from the previous stage (if one exists)
        (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
          (field* (stage-metadata query previous-stage-number)))))
     ;; resolve field from Database metadata
     (field* (database-metadata query)))))

(defmethod field-metadata* :mbql/query
  [query table field]
  (field-metadata-for-stage query -1 table field))

;;; TODO -- a little weird that this can return `nil` but [[table-metadata]] can't... but we have real cases where it
;;; makes sense that this might return `nil`, unlike for Tables

;;; TODO -- what about nested Fields??
(mu/defn field-metadata :- [:maybe FieldMetadata]
  "Get metadata for a specific Field from some `metadata` source, which might be Database metadata, Table metadata, or
  source query/results metadata. `table` is optional; if you specify it and pass Database metadata,
  this will first find the appropriate [[table-metadata]] for that Table, then find the Field metadata in that Table
  metadata.

  Returns `nil` if no matching metadata could be found."
  ([query-or-metadata field]
   (field-metadata query-or-metadata nil field))

  ([query-or-metadata table field]
   (field-metadata* query-or-metadata table field))

  ([query        :- [:map [:type [:= :pipeline]]]
    stage-number :- :int
    table-or-nil
    id-or-name]
   (field-metadata-for-stage query stage-number table-or-nil id-or-name)))
