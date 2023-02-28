(ns metabase.lib.field
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.shared.util.i18n :as i18n]
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

(mu/defn ^:private resolve-field :- ::lib.schema.ref/ref
  [query        :- [:map [:type [:= :pipeline]]]
   stage-number :- :int
   table-or-nil
   id-or-name   :- [:fn some?]]
  (let [metadata (or (lib.metadata/field-metadata query stage-number table-or-nil id-or-name)
                     (throw (ex-info (i18n/tru "Could not resolve Field {0}" (pr-str id-or-name))
                                     {:query        query
                                      :stage-number stage-number
                                      :field        id-or-name})))]
    (->field query stage-number metadata)))

(defmethod ->field :type/string
  [query stage field-name]
  (resolve-field query stage nil field-name))

(defmethod ->field :type/integer
  [query stage field-id]
  (resolve-field query stage nil field-id))

;;; Pass in a function that takes `query` and `stage` to support ad-hoc usage in tests etc
(defmethod ->field :type/fn
  [query stage f]
  (f query stage))

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

(mu/defn field :- [:or
                   [:fn fn?]
                   ::lib.schema.ref/field]
  "Create a `:field` clause. With one or two args: return a function with the signature

    (f query stage-number)

  that can be called later to resolve to a `:field` clause. With three args: return a `:field` clause right away."
  ([x]
   (fn [query stage-number]
     (->field query stage-number x)))
  ([table x]
   (fn [query stage-number]
     (resolve-field query stage-number table x)))
  ([query stage-number x]
   (->field query stage-number x)))
