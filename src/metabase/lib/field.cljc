(ns metabase.lib.field
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]))

(defmulti ->field
  "Convert something that represents a Field somehow (such as a string Field name, or Field metadata) to a `:field`
  clause, or a `:lib/field-placeholder` if we don't have enough information yet."
  {:arglists '([table-name-or-id-or-join-alias-or-nil x])}
  (fn [_table-name-or-id-or-join-alias-or-nil x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->field :type/string
  [table-name-or-join-alias field-name]
  [:lib/field-placeholder
   (cond-> {:field-name field-name}
     (string? table-name-or-join-alias) (assoc :table-name table-name-or-join-alias))])

(defmethod ->field :metadata/field
  [_ field-metadata]
  (lib.options/ensure-uuid
   (or (:field_ref field-metadata)
       (when-let [id (:id field-metadata)]
         [:field id nil])
       [:field (:name field-metadata) {:base-type (:base_type field-metadata)}])))

(defn field
  ([x]
   (->field nil x))
  ([table-name-or-id-or-join-alias-or-nil x]
   (->field table-name-or-id-or-join-alias-or-nil x)))

(defmethod lib.interface/resolve :lib/field-placeholder
  [[_clause {:keys [field-name table-name], :as options}] metadata]
  (let [field-metadata (lib.metadata/field-metadata metadata table-name field-name)
        options        (not-empty (dissoc options :field-name :table-name))]
    (-> (if (:id field-metadata)
          [:field (:id field-metadata) options]
          (let [options (assoc options :base-type (:base_type field-metadata))]
            [:field (:name field-metadata) options]))
        lib.options/ensure-uuid)))

(defmethod lib.interface/->mbql :metadata/field
  [x]
  (field x))

(defmethod lib.interface/resolve :metadata/field
  [field-metadata _metadata]
  (->field nil field-metadata))

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
