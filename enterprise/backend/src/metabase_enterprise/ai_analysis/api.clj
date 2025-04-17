(ns metabase-enterprise.ai-analysis.api
  "`/api/ee/ai-analysis/` routes"
  (:require
   [metabase-enterprise.metabot-v3.client :as metabot-client]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/analyze-chart"
  "Analyze a chart image using an AI vision model."
  [_route-params
   {model :model
    focus-instructions :focus_instructions
    extra-context :extra_context
    :as _query-params}
   {:keys [image_base64 name description timeline_events]} :- [:map
                                                              [:image_base64 :string]
                                                              [:name {:optional true} [:maybe :string]]
                                                              [:description {:optional true} [:maybe :string]]
                                                              [:timeline_events {:optional true} [:maybe [:sequential [:map
                                                                                                                      [:name :string]
                                                                                                                      [:description {:optional true} [:maybe :string]]
                                                                                                                      [:timestamp :string]]]]]]]

  (when-not image_base64
    (throw (ex-info (tru "No image data provided") {:status-code 400})))

  (premium-features/assert-has-feature :ai-entity-analysis "chart analysis")
  (let [chart-data {:image_base64 image_base64
                    :chart {:name name
                            :description description}
                    :timeline_events timeline_events}
        resp (metabot-client/analyze-chart chart-data)]
    {:summary (:analysis resp)}))

(api.macros/defendpoint :post "/analyze-dashboard"
  "Analyze a dashboard image using an AI vision model."
  [_route-params
   {model :model
    focus-instructions :focus_instructions
    extra-context :extra_context
    :as _query-params}
   {:keys [image_base64 name description tab_name]} :- [:map
                                                        [:image_base64 :string]
                                                        [:name {:optional true} [:maybe :string]]
                                                        [:description {:optional true} [:maybe :string]]
                                                        [:tab_name {:optional true} [:maybe :string]]]]

  (when-not image_base64
    (throw (ex-info (tru "No image data provided") {:status-code 400})))

  (premium-features/assert-has-feature :ai-entity-analysis "dashboard analysis")
  (let [dashboard-data {:image_base64 image_base64
                        :dashboard {:name name
                                    :description description
                                    :tab_name tab_name}}
        resp (metabot-client/analyze-dashboard dashboard-data)]
    {:summary (:analysis resp)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-analysis` routes."
  (api.macros/ns-handler *ns* +auth))
