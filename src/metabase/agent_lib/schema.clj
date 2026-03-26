(ns metabase.agent-lib.schema
  "Malli schemas for the structured MBQL program generation path."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.capabilities :as capabilities]
   [metabase.agent-lib.schema.top-level :as schema.top-level]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private top-level-operation-values
  capabilities/top-level-operator-values)

(defn- non-blank-string?
  [value]
  (and (string? value) (not (str/blank? value))))

(defn- nested-operator-tuple?
  [value]
  (and (vector? value)
       (string? (first value))
       (not (str/blank? (first value)))
       (not (top-level-operation-values (first value)))
       (not= "query" (first value))))

(defn- top-level-operation-tuple?
  [value]
  (and (vector? value)
       (string? (first value))
       (top-level-operation-values (first value))))

(defn program-literal?
  "True when `value` is a nested structured-program literal."
  [value]
  (and (map? value)
       (= "program" (or (:type value) (get value "type")))
       (or (contains? value :program)
           (contains? value "program"))))

(defn- plain-map-literal?
  [value]
  (and (map? value)
       (not (program-literal? value))))

(def ^:private registry
  {::scalar               [:or nil? :string number? boolean?]
   ::non-blank-string     [:and
                           :string
                           [:fn
                            {:error/message "value must be a non-blank string"}
                            non-blank-string?]]
   ::vector-literal       [:vector [:ref ::node]]
   ::page                 [:map {:closed true}
                           [:page ms/PositiveInt]
                           [:items ms/PositiveInt]]
   ::source-ref           [:or
                           [:tuple [:= "field"] ms/PositiveInt]
                           [:tuple [:= "table"] ms/PositiveInt]
                           [:tuple [:= "card"] ms/PositiveInt]
                           [:tuple [:= "metric"] ms/PositiveInt]]
   ::expression-ref-form  [:tuple [:= "expression-ref"] [:ref ::non-blank-string]]
   ::aggregation-ref-form [:tuple [:= "aggregation-ref"] [:int {:min 0}]]
   ::query-aware-ref      [:or
                           [:ref ::expression-ref-form]
                           [:ref ::aggregation-ref-form]]
   ::nested-operator-form [:and
                           [:vector {:min 1} [:ref ::node]]
                           [:fn
                            {:error/message "nested operator tuple must start with a non-blank non-transform operator string"}
                            nested-operator-tuple?]]
   ::program-literal      [:map {:closed true}
                           [:type [:= "program"]]
                           [:program [:ref ::program]]]
   ::map-literal          [:and
                           [:map-of :any [:ref ::node]]
                           [:fn
                            {:error/message "map literals cannot use the reserved `{\"type\":\"program\"}` shape unless they contain a valid nested program"}
                            plain-map-literal?]]
   ::form                 [:or
                           [:ref ::source-ref]
                           [:ref ::query-aware-ref]
                           [:ref ::nested-operator-form]]
   ::node                 [:or
                           [:ref ::scalar]
                           [:ref ::program-literal]
                           [:ref ::map-literal]
                           [:ref ::form]
                           [:ref ::vector-literal]]
   ::top-level-op         [:and
                           schema.top-level/query-transform-form
                           [:fn
                            {:error/message "operation tuple must start with a valid top-level operator string"}
                            top-level-operation-tuple?]]
   ::source               [:or
                           [:map {:closed true}
                            [:type [:= "context"]]
                            [:ref [:= "source"]]]
                           [:map {:closed true}
                            [:type [:enum "table" "card" "dataset" "metric"]]
                            [:id ms/PositiveInt]]
                           [:ref ::program-literal]]
   ::program              [:map {:closed true}
                           [:source [:ref ::source]]
                           [:operations [:sequential [:ref ::top-level-op]]]]})

(def ^{:doc "Malli schema for structured-program sources."} source-schema
  [:schema {:registry registry} [:ref ::source]])

(def ^{:doc "Malli schema for full structured MBQL programs."} program-schema
  [:schema {:registry registry} [:ref ::program]])

(defn validated-structure
  "Validate the structural shape of a structured program and return it unchanged."
  [program]
  (when-let [error (mr/explain program-schema program)]
    (throw (ex-info (tru "Generated program has an invalid structure.")
                    {:status-code 400
                     :error       :invalid-generated-program
                     :humanized   (mu.humanize/humanize error)
                     :details     (pr-str (mu.humanize/humanize error))
                     :schema      ::program
                     :value       program})))
  program)
