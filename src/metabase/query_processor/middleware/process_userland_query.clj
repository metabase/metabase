(ns metabase.query-processor.middleware.process-userland-query
  "Middleware related to doing extra steps for queries that are ran via API endpoints (i.e., most of them -- as opposed
  to queries ran internally e.g. as part of the sync process). These include things like saving QueryExecutions and
  formatting the results."
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.models
             [query :as query]
             [query-execution :as query-execution :refer [QueryExecution]]]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [metabase.util
             [date :as du]
             [i18n :refer [trs tru]]]
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
    :data      {:rows    []
                :cols    []
                :columns []}}
   ;; include stacktrace and preprocessed/native stages of the query if available in the response which should
   ;; make debugging queries a bit easier
   (-> (select-keys result [:stacktrace :preprocessed :native])
       (m/dissoc-in [:preprocessed :info]))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Handle Response                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- succeed [query-execution result]
  (save-successful-query-execution! query-execution result)
  (success-response query-execution result))

(defn- fail [query-execution result]
  (let [message (get result :error (tru "Unknown error"))]
    (save-failed-query-execution! query-execution message)
    (failure-response query-execution message result)))

(defn- format-userland-query-result
  "Format QP response in the format expected by the frontend client, and save a QueryExecution entry."
  [respond raise query-execution {:keys [status], :as result}]
  (cond
    ;; if the result itself is invalid there's something wrong in the QP -- not just with the query. Pass an
    ;; Exception up to the top-level handler; this is basically a 500 situation
    (nil? result)
    (raise (Exception. (str (trs "Unexpected nil response from query processor."))))

    (not status)
    (raise (Exception. (str (tru "Invalid response from database driver. No :status provided.")
                            " "
                            result)))

    ;; if query has been cancelled no need to save QueryExecution (or should we?) and no point formatting anything to
    ;; be returned since it won't be returned
    (and (= status :failed)
         (instance? InterruptedException (:class result)))
    (do
      (log/info (trs "Query canceled"))
      (respond {:status :interrupted}))

    ;; 'Normal' query failures are usually caused by invalid queries -- equivalent of a HTTP 400. Save QueryExecution
    ;; & return a "status = failed" response
    (= status :failed)
    (do
      (log/warn (trs "Query failure") (u/pprint-to-str 'red result))
      (respond (fail query-execution result)))

    ;; Successful query (~= HTTP 200): save QueryExecution & return "status = completed" response
    (= status :completed)
    (respond (succeed query-execution result))))


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
   :started_at        (du/new-sql-timestamp)
   :running_time      0
   :result_rows       0
   :start_time_millis (System/currentTimeMillis)})

(defn process-userland-query
  "Do extra handling 'userland' queries (i.e. ones ran as a result of a user action, e.g. an API call, scheduled Pulse,
  etc.). This includes recording QueryExecution entries and returning the results in an FE-client-friendly format."
  [qp]
  (fn [{{:keys [userland-query?]} :middleware, :as query} respond raise canceled-chan]
    (if-not userland-query?
      (qp query respond raise canceled-chan)
      ;; add calculated hash to query
      (let [query   (assoc-in query [:info :query-hash] (qputil/query-hash query))
            respond (partial format-userland-query-result respond raise (query-execution-info query))]
        (qp query respond raise canceled-chan)))))
