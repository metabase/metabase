(ns metabase.parameters.schema
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli :as mu]))

(mr/def ::human-readable-remapping-map
  "Schema for the map of actual value -> human-readable value. Cannot be empty."
  [:map-of {:min 1} :any [:maybe :string]])

(mr/def ::values-source-config
  "Schema for valid source_options within a Parameter"
  ;; TODO: This should be tighter
  [:map
   [:values      {:optional true} [:* :any]]
   [:card_id     {:optional true} ::lib.schema.id/card]
   [:value_field {:optional true} ::lib.schema.parameter/dimension.target]
   [:label_field {:optional true} ::lib.schema.parameter/dimension.target]])

#_(def ParameterSource
    (mc/schema
     [:multi {:dispatch :values_source_type}
      [:card        [:map
                     [:values_source_type :string]
                     [:values_source_config
                      [:map {:closed true}
                       [:card_id {:optional true} IntGreaterThanZero]
                       [:value_field {:optional true} Field]
                       [:label_field {:optional true} Field]]]]]
      [:static-list [:map
                     [:values_source_type :string]
                     [:values_source_config
                      [:map {:closed true}
                       [:values {:optional true} [:* :any]]]]]]]))

(mr/def ::keyword-or-non-blank-string
  [:or
   {:json-schema {:type "string" :minLength 1}}
   :keyword
   ::lib.schema.common/non-blank-string])

(mr/def ::card
  [:ref :metabase.queries.schema/card])

(mr/def ::dashcard
  [:ref :metabase.dashboards.schema/dashcard])

(mr/def ::id
  [:ref ::lib.schema.parameter/id])

(mr/def ::parameter-mapping
  "Valid parameter mapping for a Card or DashboardCard `parameter_mappings`."
  [:map
   {:description "parameter_mapping must be a map with :parameter_id and :target keys"}
   [:parameter_id ::id]
   [:target       [:ref ::lib.schema.parameter/target]]
   [:card_id      {:optional true} ::lib.schema.id/card]
   [:dashcard     {:optional true} [:ref ::dashcard]]])

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
   [:id                   ::id]
   [:default              {:optional true} :any]
   [:mappings             {:optional true} [:maybe [:or
                                                    [:ref ::parameter-mappings]
                                                    [:set [:ref ::parameter-mapping]]]]]
   [:name                 {:optional true} :string]
   ;; TODO (Cam 9/18/25) -- why are we mixing `camelCase` and `snake_case` here? Is this to make me sad?
   [:sectionId            {:optional true} ::lib.schema.common/non-blank-string]
   [:slug                 {:optional true} :string]
   [:target               {:optional true} [:ref ::lib.schema.parameter/target]]
   [:temporal_units       {:optional true} [:maybe [:sequential ::lib.schema.temporal-bucketing/unit]]]
   [:type                 [:ref ::lib.schema.parameter/type]]
   [:values_query_type    {:optional true} ::values-query-type]
   [:values_source_config {:optional true} ::values-source-config]
   [:values_source_type   {:optional true} [:maybe ::values-source-type]]])

(defn normalize-parameter
  "Normalize `parameter` when coming out of the application database or in via an API request."
  [parameter]
  (lib/normalize ::parameter parameter))

(mr/def ::parameters
  [:sequential [:ref ::parameter]])

(defn normalize-parameters
  "Normalize `parameters` when coming out of the application database or in via an API request."
  [parameters]
  (lib/normalize ::parameters parameters))

(mr/def ::remapped-field-value
  "Has two components:
    1. <value-of-field>          (can be anything)
    2. <value-of-remapped-field> (must be a string)"
  [:tuple :any :string])

(mr/def ::non-remapped-field-value
  "Has one component: <value-of-field>"
  [:tuple :any])

(mr/def ::field-values-list
  "Schema for a valid list of values for a field, in contexts where the field can have a remapped field."
  [:sequential
   [:or
    [:ref ::remapped-field-value]
    [:ref ::non-remapped-field-value]]])

(mr/def ::field-values-result
  "Schema for a value result of fetching the values for a field, in contexts where the field can have a remapped field."
  [:map
   [:has_more_values :boolean]
   [:values          [:ref ::field-values-list]]
   [:field_id        {:optional true} ::lib.schema.id/field]])
