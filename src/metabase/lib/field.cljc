(ns metabase.lib.field
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util.malli :as mu]))

(comment metabase.lib.schema.ref/keep-me)

(defmulti ^:private ->field
  {:arglists '([query stage-number field])}
  (fn [_query _stage-number field]
    (lib.dispatch/dispatch-value field)))

(defmethod ->field :field
  [field-clause]
  field-clause)

(defmethod ->field :metadata/field
  [_query _stage-number {base-type :base_type, field-id :id, field-name :name, field-ref :field_ref, :as _field-metadata}]
  (cond-> (or (when field-ref
                (lib.convert/->pMBQL field-ref))
              [:field {} (or field-id
                             field-name)])
    base-type (lib.options/update-options assoc :base-type base-type)
    true      lib.options/ensure-uuid))

(defmethod ->field :dispatch-type/integer
  [query _stage field-id]
  (lib.metadata/field query field-id))

;;; Pass in a function that takes `query` and `stage` to support ad-hoc usage in tests etc
(defmethod ->field :dispatch-type/fn
  [query stage f]
  (f query stage))

(defmethod lib.temporal-bucket/temporal-bucket* :field
  [[_field options id-or-name] unit]
  [:field (assoc options :temporal-unit unit) id-or-name])

(mu/defn field :- :mbql.clause/field
  "Create a `:field` clause."
  ([query x]
   (->field query -1 x))
  ([query stage-number x]
   (->field query stage-number x)))

(defn with-join-alias
  "Update a `field` so that it has `join-alias`."
  [field-or-fn join-alias]
  (if (fn? field-or-fn)
    (fn [query stage-number]
      (with-join-alias (field-or-fn query stage-number) join-alias))
    (lib.options/update-options field-or-fn assoc :join-alias join-alias)))
