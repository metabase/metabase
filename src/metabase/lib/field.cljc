(ns metabase.lib.field
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]))

(defmulti ^:private ->field
  "Implementation for [[field]]. Convert something that represents a Field somehow (such as a string Field name, or
  Field metadata) to a `:field` clause, or a `:field/unresolved` if we don't have enough information yet."
  {:arglists '([table-name-or-id-or-join-alias-or-nil x])}
  (fn [_table-name-or-id-or-join-alias-or-nil x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->field :type/string
  [table-name-or-join-alias field-name]
  [:field/unresolved
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
  "Convert something that in some universe represents a Field or column returned by the previous stage of the query to
  an appropriate MBQL clause, e.g. a `:field` clause. If we have enough information, this can return a `:field` clause
  right away. If we don't have enough info, this will return a placeholder clause, `:field/unresolved`, that
  we'll replace with a `:field` clause later.

  Why placeholders? We would like to be able to support usages like this:

    (-> (lib/query my-table)
        (lib/order-by (lib/field \"ID\"))

  In this case when `lib/field` is called, we don't have the metadata that we'd need to take \"ID\" and convert it to
  something like

    [:field 100 nil]

  So instead we'll create something like

    [:field/unresolved {:field-name \"ID\"}]

  And replace it with a `:field` clause once it gets [[metabase.lib.append/append]]ed to a query with metadata.

  A little goofy, but it lets us use this library in a natural way from the REPL and in backend tests without having
  to thread metadata thru to every single function call."
  ([x]
   (->field nil x))
  ([table-name-or-id-or-join-alias-or-nil x]
   (->field table-name-or-id-or-join-alias-or-nil x)))

(defmethod lib.interface/resolve :field/unresolved
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

(defmethod lib.temporal-bucket/temporal-bucket* :field
  [[_field id-or-name options] unit]
  [:field id-or-name (assoc options :temporal-unit unit)])

(defmethod lib.temporal-bucket/temporal-bucket* :field/unresolved
  [[_placeholder options] unit]
  [:field/unresolved (assoc options :temporal-unit unit)])
