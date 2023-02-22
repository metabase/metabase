(ns metabase.lib.metadata
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.shared.util.i18n :as i18n]))

(def FieldMetadata
  [:map
   [:type [:= :metadata/field]]
   [:id {:optional true} ms/IntGreaterThanZero]
   [:name ms/NonBlankString]])

(def TableMetadata
  [:map
   [:type [:= :metadata/table]]
   [:id ms/IntGreaterThanZero]
   [:name ms/NonBlankString]
   [:schema ms/NonBlankString]
   [:fields [:sequential FieldMetadata]]])

(def DatabaseMetadata
  [:map
   [:type [:= :metadata/database]]
   [:id ms/IntGreaterThanZero]
   [:tables [:sequential TableMetadata]]])

;;; or should this be called ResultsMetadata?
(def SourceQueryMetadata
  [:map
   [:type [:= :metadata/results]]])

(mu/defn table-metadata :- TableMetadata
  [database-metadata :- DatabaseMetadata
   table-name        :- ms/NonBlankString]
  (some (fn [table]
          (when (= (:name table) table-name)
            table))
        (:tables database-metadata)))

(mu/defn table-metadata-for-id :- TableMetadata
  [database-metadata :- DatabaseMetadata
   table-id          :- ms/IntGreaterThanZero]
  (some (fn [table]
          (when (= (:id table) table-id)
            table))
        (:tables database-metadata)))

;; TODO -- what about nested Fields??
(mu/defn field-metadata :- FieldMetadata
  ([metadata   :- [:or
                   DatabaseMetadata
                   SourceQueryMetadata]
    table-name :- [:maybe ms/NonBlankString]
    field-name :- ms/NonBlankString]
   (case (:type metadata)
     :metadata/database
     (field-metadata (table-metadata metadata table-name) field-name)

     :metadata/results
     (or (some (fn [field-metadata]
                 (when (= (:name field-metadata) field-name)
                   field-metadata))
               (:columns metadata))
         (throw (ex-info (i18n/tru "Could not find Field {0} in source query metadata" (pr-str field-name))
                         {:metadata   metadata
                          :field-name field-name})))))

  ([table-metadata :- TableMetadata
    field-name     :- ms/NonBlankString]
   (or (some (fn [field]
               (when (= (:name field) field-name)
                 field))
             (:fields table-metadata))
       (throw (ex-info (i18n/tru "Could not find Field {0} in Table {1}" (pr-str field-name) (pr-str (:name table-metadata)))
                       {:metadata   table-metadata
                        :field-name field-name})))))

(mu/defn field-metadata-for-id :- FieldMetadata
  [database-metadata :- DatabaseMetadata
   field-id          :- ms/IntGreaterThanZero]
  (some (fn [table-metadata]
          (some (fn [field-metadata]
                  (when (= (:id field-metadata) field-id)
                    field-metadata))
                (:fields table-metadata)))
        (:tables database-metadata)))
