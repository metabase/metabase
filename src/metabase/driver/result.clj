(ns metabase.driver.result
    "The `result` query processor."
    (:require [clojure.tools.logging :as log]
              [korma.core :as korma]
              [metabase.api.common :refer :all]
              [metabase.db :refer [sel]]
              [metabase.models.query-execution :refer [QueryExecution all-fields build-response]]))


(defn process-and-run [{:keys [result] :as query}]
  (log/debug "RESULT QUERY: " query)
  (if-let [query-execution (sel :one all-fields :query_id (:query_id result) (korma/order :started_at :DESC))]
    (build-response query-execution)
    {:status "failed"
     :error (str "Failed to looked result for query: " (:query_id result))}))
