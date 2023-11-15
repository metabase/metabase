(ns metabase.query-processor.pipeline
  (:require
   [clojure.core.async :as a]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]))

(def ^:dynamic ^clojure.core.async.impl.channels.ManyToManyChannel *canceled-chan*
  "If this channel is bound, you can send it a message to cancel the query. You can check if it has received a message
  to see if the query has been canceled.

  This should be bound to a [[clojure.core.async/promise-chan]] so it can be polled freely without messages being
  consumed."
  nil)

(defn canceled? []
  (some-> *canceled-chan* a/poll!))

(defn ^:dynamic *result*
  "Called exactly once with the final result, which is the result of either [[reducef]] or [[raisef]]."
  [result]
  (if (instance? Throwable result)
    (throw result)
    result))

(defn ^:dynamic *execute*
  "Called by [[runf]] to have driver run query. By default, [[metabase.driver/execute-reducible-query]]. `respond` is a
  callback with the signature:

    (respond results-metadata reducible-rows)

  The implementation of [[executef]] should call `respond` with this information once it is available. The result of
  this function is ignored."
  [driver query respond]
  (when-not (canceled?)
    (let [context {:canceled-chan *canceled-chan*}]
      (driver/execute-reducible-query driver query context respond))))

(defn ^:dynamic *reduce*
  "Called by [[runf]] (inside the `respond` callback provided by it) to reduce results of query. Reduces results, then
  calls [[resultf]] with the reduced results. results."
  [rff metadata reducible-rows]
  (when-not (canceled?)
    (let [[status rf]     (try
                            [::ok (rff metadata)]
                            (catch Throwable e
                              [::error (ex-info (i18n/tru "Error building query results reducing function: {0}" (ex-message e))
                                                {:type qp.error-type/qp, :rff rff}
                                                e)]))
          [status result] (when (= status ::ok)
                            (try
                              [::success (transduce identity rf reducible-rows)]
                              (catch Throwable e
                                [::error (ex-info (i18n/tru "Error reducing result rows: {0}" (ex-message e))
                                                  {:type qp.error-type/qp}
                                                  e)])))]
      (case status
        ::success (*result* result)
        ::error   (throw result)))))

(defn ^:dynamic *run*
  [query rff]
  (when-not (canceled?)
    (letfn [(respond [metadata reducible-rows]
              (*reduce* rff metadata reducible-rows))]
      (try
        (*execute* driver/*driver* query respond)
        (catch InterruptedException e
          (log/tracef e "Caught InterruptedException when executing query, this means the query was canceled. Ignoring exception.")
          ::cancel)))))

(def ^:dynamic ^Long *query-timeout-ms*
  "Maximum amount of time query is allowed to run, in ms."
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  (u/minutes->ms
   (if config/is-prod?
     20
     3)))
