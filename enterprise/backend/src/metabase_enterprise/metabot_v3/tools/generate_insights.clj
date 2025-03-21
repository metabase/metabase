(ns metabase-enterprise.metabot-v3.tools.generate-insights
  (:require
   [buddy.core.codecs :as codecs]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn generate-insights
  "Generate insights."
  [{what-for :for}]
  (try
    (let [[k id] (some #(find what-for %) [:metric_id :table_id :report_id :query])
          entity-type (case k
                        (:metric_id :report_id) "question"
                        :table_id "table"
                        (:query :query_id) "adhoc"
                        (throw (ex-info (str "Cannot generate insights for " what-for) {:agent-error? true})))
          entity-id (case k
                      :query (-> id json/encode .getBytes codecs/bytes->b64-str)
                      id)
          results-url (str "/auto/dashboard/" entity-type "/" entity-id)]
      (when (and (= k :table_id)
                 (not (int? id))
                 (not (and (string? id)
                           (re-matches #"(?:card__)?\d+" id))))
        (throw (ex-info "Invalid table_id" {:agent-error? true
                                            :table_id id})))
      {:output results-url
       :reactions [{:type :metabot.reaction/redirect :url results-url}]})
    (catch Exception e
      (metabot-v3.tools.u/handle-agent-error e))))
