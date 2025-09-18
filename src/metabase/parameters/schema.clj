(ns metabase.parameters.schema
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(mr/def ::human-readable-remapping-map
  "Schema for the map of actual value -> human-readable value. Cannot be empty."
  [:map-of {:min 1} :any [:maybe :string]])

(mr/def ::legacy-field-or-expression-reference
  "Schema for a valid legacy `:field` or `:expression` reference (possibly not yet normalized)."
  [:ref ::lib.schema.parameter/dimension.target]
  ;; NOCOMMIT
  #_[:fn
     (fn [k]
       ((comp (mr/validator mbql.s/FieldOrExpressionRef)
              mbql.normalize/normalize-tokens) k))])

(mr/def ::values-source-config
  "Schema for valid source_options within a Parameter"
  ;; TODO: This should be tighter
  [:map
   [:values      {:optional true} [:* :any]]
   [:card_id     {:optional true} ::lib.schema.id/card]
   [:value_field {:optional true} ::legacy-field-or-expression-reference]
   [:label_field {:optional true} ::legacy-field-or-expression-reference]])

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

(mr/def ::card
  [:and
   [:map
    [:id            {:optional true} ::lib.schema.id/card]
    [:dataset_query [:ref ::lib.schema/query]]]
   ;; we will allow maps without a Toucan model, but we won't allow ones with a DIFFERENT Toucan model.
   [:fn
    {:error/message "Instance of a Card"}
    #(contains? #{:model/Card nil} (t2/model %))]])

(mr/def ::dashcard
  [:and
   [:map
    [:id                 {:optional true} ::lib.schema.id/dashcard]
    [:card               {:optional true} [:maybe [:ref ::card]]]
    [:series             {:optional true} [:maybe [:ref ::card]]]
    [:parameter_mappings {:optional true} [:maybe [:sequential [:ref ::parameter-mapping]]]]]
   [:fn
    {:error/message "Instance of a DashboardCard"}
    #(contains? #{:model/DashboardCard nil} (t2/model %))]])

(mr/def ::parameter-mapping
  "Schema for a parameter mapping as it would appear in the DashboardCard `:parameter_mappings` column."
  [:and
   [:map
    {:description "parameter_mapping must be a map with :parameter_id and :target keys"}
    [:parameter_id ::lib.schema.parameter/id]
    [:target       ::lib.schema.parameter/target]
    [:card_id      {:optional true} ::lib.schema.id/card]
    [:dashcard     {:optional true} [:ref ::dashcard]]]
   [:map-of :keyword :any]])

(mr/def ::parameter
  "Schema for a valid Parameter. We're not using [[metabase.legacy-mbql.schema/Parameter]] here because this Parameter
  is meant to be used for Parameters we store on dashboard/card, and it has some difference with Parameter in MBQL."
  ;; TODO we could use :multi to dispatch values_source_type to the correct values_source_config
  [:map
   {:description "parameter must be a map with :id and :type keys"}
   [:id   ::lib.schema.common/non-blank-string]
   [:type ::keyword-or-non-blank-string]
   ;; TODO how to merge this with ParameterSource above?
   [:values_source_type   {:optional true} [:enum "static-list" "card" nil]]
   [:values_source_config {:optional true} ::values-source-config]
   [:slug                 {:optional true} :string]
   [:name                 {:optional true} :string]
   [:default              {:optional true} :any]
   ;; TODO (Cam 9/18/25) -- why are we mixing `camelCase` and `snake_case` here? Is this to make me sad?
   [:sectionId            {:optional true} ::lib.schema.common/non-blank-string]
   [:temporal_units       {:optional true} [:maybe [:sequential ::lib.schema.temporal-bucketing/unit]]]
   [:mappings             {:optional true} [:maybe [:sequential ::parameter-mapping]]]])

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
