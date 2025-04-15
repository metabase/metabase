(ns metabase-enterprise.ai-analysis.api
  "`/api/ee/ai-analysis/` routes"
  (:require
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
   {{:strs [image name description]} :multipart-params, :as request} :- [:map
                                                                         [:multipart-params [:map
                                                                                             ["image" [:map
                                                                                                       [:filename :string]
                                                                                                       [:tempfile (ms/InstanceOfClass java.io.File)]]]
                                                                                             ["name" :string]
                                                                                             ["description" {:optional true} :string]
                                                                          ;; TODO: add timeline_events
                                                                                             ]]]]

  (when-not (and image (:tempfile image))
    (throw (ex-info (tru "No image file provided") {:status-code 400})))

  (when-not name
    (throw (ex-info (tru "Name is required") {:status-code 400})))

  (premium-features/assert-has-feature :metabot-v3 "chart analysis")

  {:summary "## Chart Analysis\n\nThis chart displays **quarterly revenue growth** for the past fiscal year.\n\n### Key Observations:\n\n- Revenue grew consistently each quarter\n- Q4 showed the highest growth rate at 18%\n- The growth trend accelerated in the second half of the year\n- Product Line A was the primary driver of Q3 performance\n\n### Insights:\n\n1. The year-over-year growth rate of 42% exceeds industry average\n2. Seasonal patterns align with historical performance\n3. New product introductions in Q2 appear to have positive revenue impact"})

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

  (when-not name
    (throw (ex-info (tru "Name is required") {:status-code 400})))

  (premium-features/assert-has-feature :metabot-v3 "dashboard analysis")

  {:summary "## Dashboard Overview\n\nThis dashboard provides a **comprehensive business performance view** across multiple metrics.\n\n### Dashboard Highlights:\n\n- Overall revenue is trending upward with 15% YoY growth\n- Customer acquisition costs have decreased by 7%\n- User engagement metrics show improvement across all segments\n- Regional performance varies significantly with West region leading\n\n### Critical Insights:\n\n1. The correlation between marketing spend and new customer acquisition is strengthening\n2. Product category A is underperforming relative to forecast\n3. Mobile platform usage now exceeds desktop by 23%\n4. Customer retention metrics suggest recent product changes are positively received"})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/ai-analysis` routes."
  (api.macros/ns-handler *ns* +auth))
