(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process). These include things like saving QueryExecutions and
  formatting the results."
  (:require [clojure.core.async :as a]
            [medley.core :as m]
            [metabase.models
             [query :as query]
             [query-execution :as query-execution :refer [QueryExecution]]]
            [metabase.query-processor.util :as qputil]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

(defn- add-running-time [{start-time-ms :start_time_millis, :as query-execution}]
  (-> query-execution
      (assoc :running_time (- (System/currentTimeMillis) start-time-ms))
      (dissoc :start_time_millis)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Save Query Execution                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- save-query-execution!
  "Save a `QueryExecution` and update the average execution time for the corresponding `Query`."
  [{query :json_query, :as query-execution}]
  (let [query-execution (add-running-time query-execution)]
    (query/save-query-and-update-average-execution-time! query (:hash query-execution) (:running_time query-execution))
    (db/insert! QueryExecution (dissoc query-execution :json_query))))

(defn- save-successful-query-execution! [query-execution {cached? :cached, result-rows :row_count}]
  ;; only insert a new record into QueryExecution if the results *were not* cached (i.e., only if a Query was
  ;; actually ran)
  (when-not cached?
    (save-query-execution! (assoc query-execution :result_rows (or result-rows 0)))))

(defn- save-failed-query-execution! [query-execution message]
  (save-query-execution! (assoc query-execution :error (str message))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Format Response                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- success-response [{query-hash :hash, :as query-execution} {cached? :cached, :as result}]
  (merge
   (-> query-execution
       add-running-time
       (dissoc :error :hash :executor_id :card_id :dashboard_id :pulse_id :result_rows :native))
   result
   {:status                 :completed
    :average_execution_time (when cached?
                              (query/average-execution-time-ms query-hash))}))

(defn- failure-response [query-execution message result]
  (merge
   (-> query-execution
       add-running-time
       (dissoc :result_rows :hash :executor_id :card_id :dashboard_id :pulse_id :native))
   {:status    :failed
    :error     message
    :row_count 0
    :data      {:rows []
                :cols []}}
   ;; include stacktrace and preprocessed/native stages of the query if available in the response which should
   ;; make debugging queries a bit easier
   (-> (select-keys result [:stacktrace :preprocessed :native :error_type])
       (m/dissoc-in [:preprocessed :info]))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Handle Response                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- succeed [execution-info result]
  (save-successful-query-execution! execution-info result)
  (success-response execution-info result))

(defn- fail [execution-info result]
  (let [message (get result :error (tru "Unknown error"))]
    (save-failed-query-execution! execution-info message)
    (failure-response execution-info message result)))

#_(defn- add-and-save-execution-info [execution-info {:keys [status], :as result}]
  (case status
    :completed (succeed execution-info result)
    :failed    (fail execution-info result)
    result))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- query-execution-info
  "Return the info for the QueryExecution entry for this `query`."
  {:arglists '([query])}
  [{{:keys [executed-by query-hash context card-id dashboard-id pulse-id]} :info
    database-id                                                            :database
    query-type                                                             :type
    :as                                                                    query}]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  {:database_id       database-id
   :executor_id       executed-by
   :card_id           card-id
   :dashboard_id      dashboard-id
   :pulse_id          pulse-id
   :context           context
   :hash              query-hash
   :native            (= (keyword query-type) :native)
   :json_query        (dissoc query :info)
   :started_at        :%now
   :running_time      0
   :result_rows       0
   :start_time_millis (System/currentTimeMillis)})

(defn- add-and-save-execution-info-xform [execution-info]
  (fn [rf]
    (fn
      ([] (rf))

      ([result]
       (if (map? result)
         (succeed execution-info result)
         result))

      ([result row]
       (rf result row)))))

(defn process-userland-query
  "Do extra handling 'userland' queries (i.e. ones ran as a result of a user action, e.g. an API call, scheduled Pulse,
  etc.). This includes recording QueryExecution entries and returning the results in an FE-client-friendly format."
  [qp]
  (fn [query xformf {:keys [raise-chan], :as chans}]
    (let [query'         (assoc-in query [:info :query-hash] (qputil/query-hash query))
          execution-info (query-execution-info query')
          xformf'        (fn [metadata]
                           (comp (add-and-save-execution-info-xform execution-info) (xformf metadata)))]
      ;; TODO - need to add running time to failure responses as well.
      (a/go
        (let [result (a/<! finished-chan)]

          ))
      (qp query' xformf' chans))))
