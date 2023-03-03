(ns metabase.lib.field
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util.malli :as mu]))

(defmulti ^:private ->field
  {:arglists '([query stage-number field])}
  (fn [_query _stage-number field]
    (lib.dispatch/dispatch-value field)))

(defmethod ->field :metadata/field
  [_query _stage-number field-metadata]
  (lib.options/ensure-uuid
   (or (:field_ref field-metadata)
       (when-let [id (:id field-metadata)]
         [:field id nil])
       [:field (:name field-metadata) {:base-type (:base_type field-metadata)}])))

(defmethod ->field :dispatch-type/integer
  [query _stage field-id]
  (lib.metadata/field query field-id))

;;; Pass in a function that takes `query` and `stage` to support ad-hoc usage in tests etc
(defmethod ->field :dispatch-type/fn
  [query stage f]
  (f query stage))

(defmethod lib.options/options :field
  [[_field opts _id-or-name]]
  opts)

(defmethod lib.options/with-options :field
  [[_field _opts id-or-name] options]
  [:field options id-or-name])

(defmethod lib.temporal-bucket/temporal-bucket* :field
  [[_field options id-or-name] unit]
  [:field (assoc options :temporal-unit unit) id-or-name])

(mu/defn field :- [:or
                   fn?
                   ::lib.schema.ref/field]
  "Create a `:field` clause. With one or two args: return a function with the signature

    (f query stage-number)

  that can be called later to resolve to a `:field` clause. With three args: return a `:field` clause right away."
  ([x]
   (fn [query stage-number]
     (->field query stage-number x)))
  ([query stage-number x]
   (->field query stage-number x)))
