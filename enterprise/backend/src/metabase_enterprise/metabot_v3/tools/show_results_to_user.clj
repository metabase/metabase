(ns metabase-enterprise.metabot-v3.tools.show-results-to-user
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [metabase.lib.core :as lib]
   [metabase.system.core :as system]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- query->url-hash
  "Convert an MLv2/MBQL query to a base64-encoded URL hash."
  [query]
  (let [;; Normalize MLv2 query to legacy MBQL format for URL
        dataset-query (if (and (map? query) (:lib/type query))
                        (lib/->legacy-MBQL query)
                        query)]
    (-> {:dataset_query dataset-query}
        json/encode
        (.getBytes "UTF-8")
        codecs/bytes->b64-str)))

(defn show-results-to-user
  "Generate link where the query can be seen.

  Parameters:
  - query-id: ID of the query to show (from previous query_model/query_metric results)
  - queries-state: Map of query-id to query data from agent state

  The query is looked up from the state by its ID, converted to MBQL format,
  and encoded into a URL that can be navigated to."
  [{:keys [query-id queries-state]}]
  (log/info "Showing results to user" {:query-id query-id
                                       :available-queries (keys queries-state)})

  ;; Look up query from state
  (let [query (get queries-state query-id)]
    (when-not query
      (throw (ex-info (str "Query not found with ID: " query-id
                           ". Available queries: [" (str/join ", " (keys queries-state)) "]. "
                           "Make sure you're using a query ID from a previous query_model or query_metric result.")
                      {:agent-error? true
                       :query-id query-id
                       :available-queries (keys queries-state)})))

    (let [query-hash (query->url-hash query)
          results-url (str "/question#" query-hash)]
      (log/info "Generated results URL" {:query-id query-id :url results-url})
      {:output (str "Results can be seen at: " (system/site-url) results-url)
       :reactions [{:type :metabot.reaction/redirect, :url results-url}]})))
