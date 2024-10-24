(ns metabase-enterprise.metabot-v3.context
  (:require
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;;; TODO
(mr/def ::context
  [:map-of
   ;; TODO -- should this be recursive?
   {:encode/api-request #(update-keys % u/->snake_case_en)}
   :keyword
   :any])

(mu/defn hydrate-context
  "Hydrate context (about what the current user is currently looking at in the FE app), for example

    {:current_dashboard_id 1}

  With enough information that the LLM will be able to make meaningful decisions with it, e.g.

    {:current_dashboard {:name \"Car Dashboard\", :id 1, :cards [{:name \"Credit Card\", :id 2}}

  This should be a 'sparse' hydration rather than `SELECT * FROM dashboard WHERE id = 1` -- we should only include
  information needed for the LLM to do its thing rather than everything in the world."
  [context :- ::context]
  ;; TODO
  context)
