(ns metabase.parameters.schema
  (:require
   [clojure.string :as str]
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
     ((comp (mr/validator mbql.s/Field)
            mbql.normalize/normalize-tokens) k))])

(mr/def ::values-source-config
  "Schema for valid `values_source_config` within a Parameter

  See also `:metabase.lib.schema.parameter/parameter.values-source-config` for kebab-cased Lib version."
  ;; TODO: This should be tighter
  [:and
   [:map
    [:values      {:optional true} [:* :any]]
    [:card_id     {:optional true} ::lib.schema.id/card]
    [:value_field {:optional true} ::legacy-field-or-expression-reference]
    [:label_field {:optional true} ::legacy-field-or-expression-reference]]])

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

(mr/def ::parameter.id
  ::lib.schema.common/non-blank-string)

(mr/def ::parameter.mapping
  "Schema for a parameter mapping as it would appear in the DashboardCard `:parameter_mappings` column."
  [:and
   [:map-of :keyword :any]
   [:map
    [:parameter_id ::parameter.id]
    ;; TODO -- validate `:target` as well... breaks a few tests tho so those will have to be fixed (#40021)
    [:target       :any]]])

(mr/def ::parameter.mappings
  [:set [:ref ::parameter.mapping]])

(mr/def ::parameter
  "Schema for a valid Parameter. We're not using [[metabase.legacy-mbql.schema/Parameter]] here because this Parameter
  is meant to be used for Parameters we store on dashboard/card, and it has some difference with Parameter in MBQL."
  ;; TODO we could use :multi to dispatch values_source_type to the correct values_source_config
  [:and
   [:map
    {:description "parameter must be a map with :id and :type keys"}
    [:id   ::parameter.id]
    [:type ::keyword-or-non-blank-string]
    ;; TODO how to merge this with ParameterSource above?
    [:values_source_type   {:optional true} [:maybe [:enum :static-list :card]]]
    [:values_source_config {:optional true} ::values-source-config]
    [:slug                 {:optional true} :string]
    [:name                 {:optional true} :string]
    [:default              {:optional true} :any]
    ;; TODO (Cam 9/9/25) -- sometimes I feel like I'm being Punk'd, why is there this one random key that uses
    ;; camelCase. Is this a prank?
    [:sectionId            {:optional true} ::lib.schema.common/non-blank-string]
    [:temporal_units       {:optional true} [:sequential ::lib.schema.temporal-bucketing/unit]]
    [:mappings             {:optional true} [:maybe [:ref ::parameter.mappings]]]]
   [:fn
    {:error/message (str "Parameters (from the app DB, not in MBQL) should use all snake_case keys, except for"
                         " sectionId, which someone probably added as a prank.")}
    (fn [m]
      (every? (fn [k]
                (not (str/includes? (str k) "-")))
              (keys m)))]])

(mr/def ::parameter-mapping
  "Schema for a valid Parameter Mapping"
  [:map
   {:description "parameter_mapping must be a map with :parameter_id and :target keys"}
   [:parameter_id ::lib.schema.common/non-blank-string]
   [:target       :any]
   [:card_id      {:optional true} ::lib.schema.id/card]])
