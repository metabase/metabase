(ns metabase.lib.field
  (:require
   [metabase.lib.deflate :as lib.deflate]
   [metabase.lib.inflate :as lib.inflate]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def FieldInfo
  [:map
   [:type [:= ::field]]
   [:table-name {:optional true} [:maybe ms/NonBlankString]]
   [:field-name ms/NonBlankString]
   [:options {:optional true} [:map]]])

(mu/defn field :- FieldInfo
  ([field-name :- ms/NonBlankString]
   {:type       ::field
    :field-name field-name})

  ([table-name :- ms/NonBlankString
    field-name :- ms/NonBlankString]
   {:type       ::field
    :table-name table-name
    :field-name field-name}))

(defmethod lib.deflate/deflate ::field
  [metadata {:keys [table-name field-name options]}]
  (let [field-metadata (lib.metadata/field-metadata metadata table-name field-name)]
    (if (:id field-metadata)
      [:field (:id field-metadata) (when (seq options) options)]
      (let [options (assoc options :base-type (:base_type field-metadata))]
        [:field (:name field-metadata) options]))))

(defmethod lib.inflate/inflate :mbql/field
  [metadata [_field field-id options]]
  (let [field-metadata (lib.metadata/field-metadata-for-id metadata field-id)
        table-metadata (lib.metadata/table-metadata-for-id metadata (:table_id field-metadata))]
    (merge
     {:type       ::field
      :table-name (:name table-metadata)
      :field-name (:name field-metadata)}
     (when (seq options)
       {:options options}))))

(defmethod lib.temporal-bucket/temporal-bucket* :mbql/field
  [[_field id-or-name options] unit]
  [:field id-or-name (assoc options :temporal-unit unit)])

(defmethod lib.temporal-bucket/temporal-bucket* :metabase.lib.field/field
  [field-info unit]
  (assoc-in field-info [:options :temporal-unit] unit))
