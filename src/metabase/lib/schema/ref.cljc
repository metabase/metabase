(ns metabase.lib.schema.ref
  "Malli schema for a Field, aggregation, or expression reference (etc.)"
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.id :as id]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(mr/def ::field.options
  [:merge
   ::common/options
   [:map
    [:temporal-unit {:optional true} ::temporal-bucketing/unit]]])

(mr/def ::field.literal.options
  [:merge
   ::field.options
   [:map
    [:base-type ::common/base-type]]])

;;; `:field` clause
(mr/def ::field.literal
  [:tuple
   [:= :field]
   ::field.literal.options
   ::common/non-blank-string])

(mr/def ::field.id
  [:tuple
   [:= :field]
   ::field.options ; TODO -- we should make `:base-type` required here too
   ::id/field])

(mbql-clause/define-mbql-clause :field
  [:and
   [:tuple
    [:= :field]
    ::field.options
    [:or ::id/field ::common/non-blank-string]]
   [:multi {:dispatch      (fn [clause]
                             ;; apparently it still tries to dispatch when humanizing errors even if the `:tuple`
                             ;; schema above failed, so we need to check that this is actually a tuple here again.
                             (when (sequential? clause)
                               (let [[_field _opts id-or-name] clause]
                                 (lib.dispatch/dispatch-value id-or-name))))
            ;; without this it gives us dumb messages like "Invalid dispatch value" if the dispatch function above
            ;; doesn't return something that matches.
            :error/message "Invalid :field clause ID or name: must be a string or integer"}
    [:dispatch-type/integer ::field.id]
    [:dispatch-type/string ::field.literal]]])

(lib.hierarchy/derive :field ::ref)

(defmethod expression/type-of-method :field
  [[_tag opts _id-or-name]]
  (or ((some-fn :effective-type :base-type) opts)
      ::expression/type.unknown))

(mbql-clause/define-tuple-mbql-clause :expression
  ::common/non-blank-string)

(defmethod expression/type-of-method :expression
  [[_tag opts _expression-name]]
  (or ((some-fn :effective-type :base-type) opts)
      ::expression/type.unknown))

(lib.hierarchy/derive :expression ::ref)

(mr/def ::aggregation-options
  [:merge
   ::common/options
   [:map
    [:name {:optional true} ::common/non-blank-string]
    [:display-name {:optional true} ::common/non-blank-string]]])

(mbql-clause/define-mbql-clause :aggregation
  [:tuple
   [:= :aggregation]
   ::aggregation-options
   :string])

(defmethod expression/type-of-method :aggregation
  [[_tag opts _index]]
  (or ((some-fn :effective-type :base-type) opts)
      ::expression/type.unknown))

(lib.hierarchy/derive :aggregation ::ref)

(mbql-clause/define-tuple-mbql-clause :segment :- :type/Boolean
  #_segment-id [:schema [:ref ::id/segment]])

(lib.hierarchy/derive :segment ::ref)

(mbql-clause/define-tuple-mbql-clause :metric :- ::expression/type.unknown
  #_metric-id [:schema [:ref ::id/metric]])

(lib.hierarchy/derive :metric ::ref)

(mr/def ::ref
  [:and
   ::mbql-clause/clause
   [:fn
    {:error/fn (fn [_ _]
                 (str "Valid reference, must be one of these clauses: "
                      (str/join ", " (sort (descendants @lib.hierarchy/hierarchy ::ref)))))}
    (fn [[tag :as _clause]]
      (lib.hierarchy/isa? tag ::ref))]])
