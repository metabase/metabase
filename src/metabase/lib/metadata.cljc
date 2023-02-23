(ns metabase.lib.metadata
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def FieldMetadata
  [:map
   [:lib/type [:= :metadata/field]]
   [:id {:optional true} ms/IntGreaterThanZero]
   [:name ms/NonBlankString]])

(def TableMetadata
  [:map
   [:lib/type [:= :metadata/table]]
   [:id ms/IntGreaterThanZero]
   [:name ms/NonBlankString]
   [:schema ms/NonBlankString]
   [:fields [:sequential FieldMetadata]]])

(def DatabaseMetadata
  [:map
   [:lib/type [:= :metadata/database]]
   [:id ms/IntGreaterThanZero]
   [:tables [:sequential TableMetadata]]])

;;; or should this be called ResultsMetadata?
(def SourceQueryMetadata
  [:map
   [:lib/type [:= :metadata/results]]
   [:columns [:sequential FieldMetadata]]])

(defmulti table-metadata*
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

(defmethod table-metadata* :lib/outer-query
  [query table-name-or-id]
  (table-metadata* (:lib/metadata query) table-name-or-id))

(mu/defn table-metadata :- TableMetadata
  [metadata         :- [:map
                        [:lib/type [:keyword]]]
   table-name-or-id :- [:or
                        ms/IntGreaterThanZero
                        ms/NonBlankString]]
  (table-metadata* metadata table-name-or-id))

(defmulti field-metadata*
  {:arglists '([metadata table-name-or-id-or-nil field-name-or-id])}
  (fn [metadata _table-name-or-id-or-nil _field-name-or-id]
    (lib.dispatch/dispatch-value metadata)))

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

(defmethod field-metadata* :lib/outer-query
  [query table-name-or-id-or-nil field-name-or-id]
  (field-metadata* (:lib/metadata query) table-name-or-id-or-nil field-name-or-id))

;; TODO -- what about nested Fields??
(mu/defn field-metadata :- FieldMetadata
  ([metadata         :- [:map
                         [:lib/type [:keyword]]]
    field-name-or-id :- [:or ms/NonBlankString ms/IntGreaterThanZero]]
   (field-metadata metadata nil field-name-or-id))

  ([metadata                :- [:map
                                [:lib/type [:keyword]]]
    table-name-or-id-or-nil :- [:maybe [:or ms/NonBlankString ms/IntGreaterThanZero]]
    field-name-or-id        :- [:or ms/NonBlankString ms/IntGreaterThanZero]]
   (field-metadata* metadata table-name-or-id-or-nil field-name-or-id)))
