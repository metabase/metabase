(ns metabase.metabot.api.entity-analysis
  "`/api/ai-entity-analysis/` routes"
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.usage :as metabot.usage]))

(set! *warn-on-reflection* true)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/analyze-chart"
  "Analyze a chart image using an AI vision model. This function sends the image data to a separate external AI service
  for analysis."
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

  (metabot.config/check-metabot-enabled!)
  (metabot.usage/check-metabase-managed-free-limit!)
  (let [chart-data {:image_base64 image_base64
                    :chart {:name name
                            :description description}
                    :timeline_events timeline_events}
        resp (metabot/analyze-chart chart-data)]
    {:summary (:analysis resp)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ai-entity-analysis` routes."
  (api.macros/ns-handler *ns* +auth))
