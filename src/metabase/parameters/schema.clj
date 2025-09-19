(ns metabase.parameters.schema
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(mr/def ::human-readable-remapping-map
  "Schema for the map of actual value -> human-readable value. Cannot be empty."
  [:map-of {:min 1} :any [:maybe :string]])

(mr/def ::legacy-field-or-expression-reference
  "Schema for a valid legacy `:field` or `:expression` reference (possibly not yet normalized)."
  [:fn
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
   [:sectionId            {:optional true} ::lib.schema.common/non-blank-string]
   [:temporal_units       {:optional true} [:sequential ::lib.schema.temporal-bucketing/unit]]
   ;; TODO FIXME -- I've seen this key used in [[metabase.parameters.params/dashboard-param->field-ids]] but no idea
   ;; what the expected shape is supposed to be. Please fixx
   [:mappings             {:optional true} :any]])

(mr/def ::parameter-mapping
  "Schema for a valid Parameter Mapping"
  [:map
   {:description "parameter_mapping must be a map with :parameter_id and :target keys"}
   [:parameter_id ::lib.schema.common/non-blank-string]
   [:target       :any]
   [:card_id      {:optional true} ::lib.schema.id/card]])
