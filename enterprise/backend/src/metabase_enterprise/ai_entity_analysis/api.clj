(ns metabase-enterprise.ai-entity-analysis.api
  "`/api/ee/ai-entity-analysis/` routes"
  (:require
   [metabase-enterprise.metabot-v3.core :as metabot-v3]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.premium-features.core :as premium-features]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/analyze-chart"
  "Analyze a chart image using an AI vision model. This function sends the image data to a separate external AI service for analysis."
  [_route-params
   _query-params
   {:keys [image_base64 name description timeline_events]} :- [:map
                                                               [:image_base64 :string]
                                                               [:name {:optional true} [:maybe :string]]
                                                               [:description {:optional true} [:maybe :string]]
                                                               [:timeline_events {:optional true} [:maybe [:sequential [:map
                                                                                                                        [:name :string]
                                                                                                                        [:description {:optional true} [:maybe :string]]
                                                                                                                        [:timestamp :string]]]]]]]

  (premium-features/assert-has-feature :ai-entity-analysis "chart analysis")
  (let [chart-data {:image_base64 image_base64
                    :chart {:name name
                            :description description}
                    :timeline_events timeline_events}
        resp (metabot-v3/analyze-chart chart-data)]
    {:summary (:analysis resp)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-entity-analysis` routes."
  (api.macros/ns-handler *ns* +auth))
