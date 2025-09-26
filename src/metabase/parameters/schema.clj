(ns metabase.parameters.schema
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::human-readable-remapping-map
  "Schema for the map of actual value -> human-readable value. Cannot be empty."
  [:map-of {:min 1} :any [:maybe :string]])

(mr/def ::legacy-ref
  [:multi {:dispatch (fn [x]
                       (if (and (vector? x)
                                (#{:expression "expression"} (first x)))
                         :expression
                         :field))}
   [:expression ::lib.schema.parameter/target.legacy-expression-ref]
   [:field      ::lib.schema.parameter/target.legacy-field-ref]])

(mr/def ::values-source-config
  "Schema for valid source_options within a Parameter"
  ;; TODO: This should be tighter
  [:map
   [:values      {:optional true} [:* :any]]
   [:card_id     {:optional true} ::lib.schema.id/card]
   [:value_field {:optional true} [:ref ::legacy-ref]]
   [:label_field {:optional true} [:ref ::legacy-ref]]])

#_(def ParameterSource
    (mc/schema
     [:multi {:dispatch :values_source_type}
      ["card"        [:map
                      [:values_source_type :string]
                      [:values_source_config
                       [:map {:closed true}
                        [:card_id {:optional true} IntGreaterThanZero]
                        [:value_field {:optional true} Field]
                        [:label_field {:optional true} Field]]]]]
      ["static-list" [:map
                      [:values_source_type :string]
                      [:values_source_config
                       [:map {:closed true}
                        [:values {:optional true} [:* :any]]]]]]]))

(mr/def ::keyword-or-non-blank-string
  [:or
   {:json-schema {:type "string" :minLength 1}}
   :keyword
   ::lib.schema.common/non-blank-string])

(mr/def ::values-source-type
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :static-list :card])

(mr/def ::values-query-type
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :none :list :search])

(mr/def ::parameter
  "Schema for a valid Parameter. We're not using [[metabase.legacy-mbql.schema/Parameter]] here because this Parameter
  is meant to be used for Parameters we store on dashboard/card, and it has some difference with Parameter in MBQL."
  ;; TODO we could use :multi to dispatch values_source_type to the correct values_source_config
  [:map
   {:description "parameter must be a map with :id and :type keys"}
   [:default              {:optional true} :any]
   ;; TODO (Cam 9/18/25) -- why are we mixing `camelCase` and `snake_case` here? Is this to make me sad?
   [:filteringParameters  {:optional true} [:maybe [:sequential ::lib.schema.parameter/id]]]
   [:id                   ::lib.schema.parameter/id]
   [:mappings             {:optional true} [:maybe [:or
                                                    [:sequential [:ref ::parameter-mapping]]
                                                    [:set [:ref ::parameter-mapping]]]]]
   [:name                 {:optional true} :string]
   ;; ok now I know you're trying to mess with me
   [:sectionId            {:optional true} ::lib.schema.common/non-blank-string]
   [:slug                 {:optional true} :string]
   [:target               {:optional true} [:ref ::lib.schema.parameter/target]]
   [:temporal_units       {:optional true} [:maybe [:sequential ::lib.schema.temporal-bucketing/unit]]]
   [:type                 [:ref ::lib.schema.parameter/type]]
   [:values_query_type    {:optional true} [:maybe ::values-query-type]]
   [:values_source_config {:optional true} [:maybe ::values-source-config]]
   [:values_source_type   {:optional true} [:maybe ::values-source-type]]])

(mu/defn normalize-parameter :- ::parameter
  "Normalize `parameter` when coming out of the application database or in via an API request."
  [parameter]
  (lib/normalize ::parameter parameter))

(mr/def ::parameters
  [:sequential [:ref ::parameter]])

(mu/defn normalize-parameters :- ::parameters
  "Normalize `parameters` when coming out of the application database or in via an API request."
  [parameters]
  (lib/normalize ::parameters parameters))

(def transform-parameters
  "Toucan 2 transform for columns that are sequences of Card/Dashboard parameters."
  {:in  (comp mi/json-in normalize-parameters)
   :out (comp (mi/catch-normalization-exceptions normalize-parameters) mi/json-out-with-keywordization)})

(mr/def ::parameter-mapping
  "Schema for a valid Parameter Mapping"
  [:map
   {:description "parameter_mapping must be a map with :parameter_id and :target keys"}
   [:parameter_id ::lib.schema.parameter/id]
   [:target       ::lib.schema.parameter/target]
   [:card_id      {:optional true} ::lib.schema.id/card]
   [:dashcard     {:optional true} :map]])

(mu/defn normalize-parameter-mapping :- ::parameter-mapping
  "Normalize `parameter-mappings` when coming out of the application database or in via an API request."
  [parameter-mapping]
  (lib/normalize ::parameter-mapping parameter-mapping))

(mr/def ::parameter-mappings
  [:sequential [:ref ::parameter-mapping]])

(mu/defn normalize-parameter-mappings :- [:maybe ::parameter-mappings]
  "Normalize `parameter-mappings` when coming out of the application database or in via an API request."
  [parameter-mappings :- [:maybe [:sequential :map]]]
  (when parameter-mappings
    (lib/normalize ::parameter-mappings parameter-mappings)))

(def transform-parameter-mappings
  "Toucan 2 transform for columns that are sequences of Card/Dashboard parameter mappings."
  {:in  (comp mi/json-in normalize-parameter-mappings)
   :out (comp (mi/catch-normalization-exceptions normalize-parameter-mappings) mi/json-out-with-keywordization)})
