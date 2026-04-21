(ns metabase.parameters.schema
  (:require
   #?@(:clj
       ([metabase.models.interface :as mi]))
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::human-readable-remapping-map
  "Schema for the map of actual value -> human-readable value. Cannot be empty."
  [:map-of {:min 1} :any [:maybe :string]])

(mr/def ::legacy-ref
  [:multi {:dispatch (fn [x]
                       (if (and (sequential? x)
                                (#{:expression "expression"} (first x)))
                         :expression
                         :field))}
   [:expression ::lib.schema.parameter/target.legacy-expression-ref]
   [:field      ::lib.schema.parameter/target.legacy-field-ref]])

(defn- normalize-values-source-config [m]
  (when (map? m)
    ;; remove empty/nil values
    (reduce-kv
     (fn [m k v]
       (cond-> m
         (or (nil? v)
             (and (sequential? v)
                  (empty? v)))
         (dissoc k)))
     m
     m)))

(mr/def ::values-source-config
  "Schema for valid source_options within a Parameter"
  ;; TODO: This should be tighter
  [:map
   {:decode/normalize normalize-values-source-config}
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

(mr/def ::values-source-type
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :static-list :card])

(mr/def ::values-query-type
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :none :list :search])

(mr/def ::parameter
  "Schema for a valid stored parameter declaration saved as part of a Dashboard or Card. We're not using
  `::metabase.lib.schema.parameter/parameter` here because these differ a bit from the parameters attached to
  queries."
  ;; TODO we could use :multi to dispatch values_source_type to the correct values_source_config
  [:map
   {:description      "parameter must be a map with :id and :type keys"
    :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:default              {:optional true} :any]
   ;; TODO (Cam 9/18/25) -- why are we mixing `camelCase` and `snake_case` here? Is this to make me sad?
   [:filteringParameters  {:optional true} [:maybe [:sequential ::lib.schema.parameter/id]]]
   [:id                   ::lib.schema.parameter/id]
   [:mappings             {:optional true} [:maybe [:or
                                                    [:sequential [:ref ::parameter-mapping]]
                                                    [:set [:ref ::parameter-mapping]]]]]
   [:name                 {:optional true} :string]
   ;; ok now I know you're trying to mess with me with this camelCase key
   [:sectionId            {:optional true} ::lib.schema.common/non-blank-string]
   [:slug                 {:optional true} :string]
   [:target               {:optional true} [:ref ::lib.schema.parameter/target]]
   [:temporal_units       {:optional true} [:maybe [:sequential ::lib.schema.temporal-bucketing/unit]]]
   [:type                 [:ref ::lib.schema.parameter/type]]
   [:values_query_type    {:optional true} [:maybe ::values-query-type]]
   [:values_source_config {:optional true} [:maybe ::values-source-config]]
   [:values_source_type   {:optional true} [:maybe ::values-source-type]]])
;;; TODO (Cam 10/20/25) -- does this need to include `widget-type` as well? Or is that only set for template tags?

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

(mr/def ::parameter-with-optional-type
  [:merge
   ::parameter
   [:map
    [:type {:optional true} [:ref ::lib.schema.parameter/type]]]])

(mr/def ::parameters-with-optional-types
  [:sequential ::parameter-with-optional-type])

(mu/defn normalize-parameters-without-adding-default-types :- ::parameters-with-optional-types
  "The same as [[normalize-parameters]], but does not add a default `:type` if it is missing. Needed in some cases
  where we infer the type based on the `:widget-type` in the saved parameter declarations inside a Card or Dashboard,
  e.g. when running an embedded Card with the Card QP."
  [parameters]
  (lib/normalize ::parameters-with-optional-types parameters))

#?(:clj
   (def transform-parameters
     "Toucan 2 transform for columns that are sequences of Card/Dashboard parameters."
     {:in  (comp mi/json-in normalize-parameters)
      :out (comp (mi/catch-normalization-exceptions normalize-parameters) mi/json-out-with-keywordization)}))

(mr/def ::parameter-mapping
  "Schema for a valid Parameter Mapping"
  [:map
   {:decode/normalize (fn [mapping]
                        (when (map? mapping)
                          (let [mapping (lib.schema.common/normalize-map-no-kebab-case mapping)]
                            (cond-> mapping
                              (not (pos-int? (:card_id mapping))) (dissoc :card_id)))))
    :description "parameter_mapping must be a map with :parameter_id and :target keys"}
   [:parameter_id ::lib.schema.parameter/id]
   [:target       ::lib.schema.parameter/target]
   [:card_id      {:optional true} [:maybe ::lib.schema.id/card]]
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

#?(:clj
   (def transform-parameter-mappings
     "Toucan 2 transform for columns that are sequences of Card/Dashboard parameter mappings."
     {:in  (comp mi/json-in normalize-parameter-mappings)
      :out (comp (mi/catch-normalization-exceptions normalize-parameter-mappings) mi/json-out-with-keywordization)}))
