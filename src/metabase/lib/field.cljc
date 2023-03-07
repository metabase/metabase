(ns metabase.lib.field
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
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

(defn- resolve-field [query stage-number table-or-nil id-or-name]
  (let [metadata (letfn [(field-metadata [metadata]
                           (when metadata
                             (lib.metadata/field-metadata metadata table-or-nil id-or-name)))]
                   ;;; TODO -- I think maybe this logic should actually be part of [[metabase.lib.metadata]]
                   ;;; -- [[metabase.lib.field-metadata]] should be the one doing this nonsense
                   (or
                    ;; resolve field from the current stage
                    (field-metadata (lib.metadata/stage-metadata query stage-number))
                    ;; resolve field from the previous stage (if one exists)
                    (when (lib.util/has-stage? query (dec stage-number))
                      (field-metadata (lib.metadata/stage-metadata query (dec stage-number))))
                    ;; resolve field from Database metadata
                    ;;
                    ;; note that this might not actually make sense, because the Field in question might not actually
                    ;; be visible from the current stage of the query. But on the other hand it might not be visible
                    ;; but still legal to add, e.g. an implicitly joined Field from another Tables. We need to noodle
                    ;; on this a bit more and figure out how to do this in a way that errors on invalid usage. I'm
                    ;; iterating on this a bit in #28717 but there is still more work to do
                    (field-metadata (lib.metadata/database-metadata query))))]
    (when-not (= (:lib/type metadata) :metadata/field)
      (throw (ex-info (i18n/tru "Could not resolve Field {0}" (pr-str id-or-name))
                      {:query        query
                       :stage-number stage-number
                       :field        id-or-name})))
    (->field query stage-number metadata)))

(defmethod ->field :dispatch-type/string
  [query stage field-name]
  (resolve-field query stage nil field-name))

(defmethod ->field :dispatch-type/integer
  [query stage field-id]
  (resolve-field query stage nil field-id))

;;; Pass in a function that takes `query` and `stage` to support ad-hoc usage in tests etc
(defmethod ->field :dispatch-type/fn
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
                   ::lib.schema.ref/field.builder
                   ::lib.schema.ref/field]
  "Create a `:field` clause. With one or two args: return a function with the signature

    (f query stage-number)

  that can be called later to resolve to a `:field` clause. With three args: return a `:field` clause right away."
  ([x]
   (mu/fn :- ::lib.schema.ref/field
     [query :- ::lib.schema/query
      stage-number :- int?]
     (->field query stage-number x)))
  ([table x]
   (mu/fn :- ::lib.schema.ref/field
     [query :- ::lib.schema/query
      stage-number :- int?]
     (resolve-field query stage-number table x)))
  ([query stage-number x]
   (->field query stage-number x)))
