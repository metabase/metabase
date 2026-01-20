(ns metabase.ai.api
  "AI summary endpoints."
  (:require
   [metabase.ai.settings :as ai.settings]
   [metabase.ai.summary :as ai.summary]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- card-summary-payload
  [card-id parameters]
  (let [card (api/read-check (t2/select-one :model/Card :id card-id))
        result (ai.summary/run-card-query card-id parameters)]
    (ai.summary/summarize-result!
     {:card card
      :parameters parameters
      :result result})))

;; TODO (AI Summaries) add response schema when we formalize AI endpoints.
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/summary/card/:card-id"
  "Generate an AI summary for a saved Card."
  [{:keys [card-id]} :- [:map
                         [:card-id ms/PositiveInt]]
   _query-params
   {:keys [parameters]} :- [:map
                            [:parameters {:optional true} [:maybe [:sequential [:map-of :keyword :any]]]]]]
  (api/check-400 (ai.settings/ai-openai-available?)
                 (tru "AI summaries are not configured."))
  (let [user-id api/*current-user-id*
        start   (System/nanoTime)]
    (try
      (let [response (card-summary-payload card-id parameters)
            duration-ms (long (/ (- (System/nanoTime) start) 1000000))]
        (log/infof "AI summary succeeded for card %d user %d in %dms" card-id user-id duration-ms)
        response)
      (catch Exception e
        (let [duration-ms (long (/ (- (System/nanoTime) start) 1000000))]
          (log/warnf e "AI summary failed for card %d user %d in %dms" card-id user-id duration-ms)
          (throw e))))))
