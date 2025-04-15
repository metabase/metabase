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
  {:multipart true}
  [_route-params
   {model :model
    focus-instructions :focus_instructions
    extra-context :extra_context
    :as _query-params}
   _body
   {{:strs [image]} :multipart-params, :as request} :- [:map
                                                        [:multipart-params [:map
                                                                            ["image" [:map
                                                                                      [:filename :string]
                                                                                      [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (when-not (and image (:tempfile image))
    (throw (ex-info (tru "No image file provided") {:status-code 400})))

  (premium-features/assert-has-feature :metabot-v3 "chart analysis")
  (let [resp (metabot-client/analyze-chart image)]
    {:summary (:analysis resp)}))

(api.macros/defendpoint :post "/analyze-dashboard"
  "Analyze a dashboard image using an AI vision model."
  {:multipart true}
  [_route-params
   {model :model
    focus-instructions :focus_instructions
    extra-context :extra_context
    :as _query-params}
   _body
   {{:strs [image name description tab_name]} :multipart-params, :as request} :- [:map
                                                                                  [:multipart-params [:map
                                                                                                      ["image" [:map
                                                                                                                [:filename :string]
                                                                                                                [:tempfile (ms/InstanceOfClass java.io.File)]]]
                                                                                                      ["name" :string]
                                                                                                      ["description" {:optional true} :string]
                                                                                                      ["tab_name" {:optional true} :string]]]]]

  (when-not (and image (:tempfile image))
    (throw (ex-info (tru "No image file provided") {:status-code 400})))

  (premium-features/assert-has-feature :metabot-v3 "dashboard analysis")
  (let [resp (metabot-client/analyze-dashboard image)]
    {:summary (:analysis resp)}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-analysis` routes."
  (api.macros/ns-handler *ns* +auth))
