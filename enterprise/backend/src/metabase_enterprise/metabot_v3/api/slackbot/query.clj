(ns metabase-enterprise.metabot-v3.api.slackbot.query
  "Ad-hoc query execution and visualization for slackbot."
  (:require
   [metabase.api.common :as api]
   [metabase.channel.render.core :as channel.render]
   [metabase.query-processor :as qp]))

(set! *warn-on-reflection* true)

(defn execute-adhoc-query
  "Execute an ad-hoc MBQL query and return results."
  [query]
  (qp/process-query
   (-> query
       (update-in [:middleware :js-int-to-string?] (fnil identity true))
       qp/userland-query-with-default-constraints
       (update :info merge {:executed-by api/*current-user-id*
                            :context     :slackbot}))))

(defn generate-adhoc-png
  "Execute an ad-hoc query and render results to PNG."
  [query & {:keys [display]
            :or   {display :table}}]
  (let [results    (execute-adhoc-query query)
        adhoc-card {:display                display
                    :visualization_settings {}}]
    (channel.render/render-adhoc-card-to-png
     adhoc-card
     results
     1280
     {:channel.render/padding-x 32})))
