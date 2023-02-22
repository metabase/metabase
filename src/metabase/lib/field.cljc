(ns metabase.lib.field
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.resolve :as lib.resolve]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn field :- :lib/field-placeholder
  ([field-name :- ms/NonBlankString]
   [:lib/field-placeholder {:field-name field-name}])

  ([table-name :- ms/NonBlankString
    field-name :- ms/NonBlankString]
   [:lib/field-placeholder {:field-name field-name, :table-name table-name}]))

(defmethod lib.resolve/resolve :lib/field-placeholder
  [metadata [_clause {:keys [field-name table-name], :as options}]]
  (let [field-metadata (lib.metadata/field-metadata metadata table-name field-name)
        options        (not-empty (dissoc options :field-name :table-name))]
    (-> (if (:id field-metadata)
          [:field (:id field-metadata) options]
          (let [options (assoc options :base-type (:base_type field-metadata))]
            [:field (:name field-metadata) options]))
        lib.options/ensure-uuid)))

(defmethod lib.options/options :field
  [clause]
  (last clause))

(defmethod lib.options/with-options :field
  [[_field id-or-name _opts] options]
  [:field id-or-name options])

(defmethod lib.temporal-bucket/temporal-bucket* :mbql/field
  [[_field id-or-name options] unit]
  [:field id-or-name (assoc options :temporal-unit unit)])

(defmethod lib.temporal-bucket/temporal-bucket* :lib/field-placeholder
  [[_placeholder options] unit]
  [:lib/field-placeholder (assoc options :temporal-unit unit)])
