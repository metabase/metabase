(ns metabase.query-processor.pipeline
  (:require
   [clojure.core.async :as a]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
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

(defn canceled?
  "Whether the current query execution has been canceled. This is usually triggered by an HTTP connection closing when
  running queries from the REST API; you should check this before or while doing something expensive (such as before
  running the query against a data warehouse) to avoid doing work for queries that have been canceled."
  []
  (some-> *canceled-chan* a/poll!))

(defn ^:dynamic *result*
  "Called exactly once with the final result, which is the result of either [[*reduce*]] (if query completed
  successfully), or an Exception (if it did not)."
  [result]
  (if (instance? Throwable result)
    (throw result)
    result))

(defn ^:dynamic *execute*
  "Called by [[*run*]] to have driver run query. By default, [[metabase.driver/execute-reducible-query]]. `respond` is a
  callback with the signature:

    (respond results-metadata reducible-rows)

  The implementation should call `respond` with this information once it is available. `response` MUST BE CALLED
  SYNCHRONOUSLY, and [[*execute*]] should ultimately return whatever it returns."
  [driver query respond]
  (when-not (canceled?)
    ;; the context map that gets passed to [[driver/execute-reducible-query]] is for backwards compatibility for
    ;; pre-#35465 code
    (let [context {:canceled-chan *canceled-chan*}]
      (driver/execute-reducible-query driver query context respond))))

(defn ^:dynamic *reduce*
  "Called by [[*run*]] (inside the `respond` callback provided by it) to reduce results of query. Reduces results, then
  calls [[*result*]] with the reduced results."
  [rff metadata reducible-rows]
  (when-not (canceled?)
    (let [[status rf-or-e] (try
                             [::ready-to-reduce (rff metadata)]
                             (catch Throwable e
                               [::error (ex-info (i18n/tru "Error building query results reducing function: {0}" (ex-message e))
                                                 {:type qp.error-type/qp, :rff rff}
                                                 e)]))
          [status result]  (case status
                             ::ready-to-reduce
                             (try
                               [::success (transduce (fn [rf]
                                                       (fn wrapper
                                                         ([] (rf))
                                                         ([acc]
                                                          (some-> *canceled-chan* a/close!)
                                                          (rf acc))
                                                         ([acc row]
                                                          (rf acc row))))
                                                     rf-or-e
                                                     reducible-rows)]
                               (catch Throwable e
                                 [::error (ex-info (i18n/tru "Error reducing result rows: {0}" (ex-message e))
                                                   {:type qp.error-type/qp}
                                                   e)]))

                             ::error
                             [status rf-or-e])]
      (case status
        ::success (*result* result)
        ::error   (throw result)))))

(defn- interrupted-exception?
  "If Throwable `e` is an InterruptedException or one of its causes is."
  [e]
  (or (instance? InterruptedException e)
      (some-> (ex-cause e) interrupted-exception?)))

(defn ^:dynamic *run*
  "Function for running the query. Calls [[*execute*]], then [[*reduce*]] on the results."
  [query rff]
  (when-not (canceled?)
    (letfn [(respond [metadata reducible-rows]
              (*reduce* rff metadata reducible-rows))]
      (try
        (*execute* driver/*driver* query respond)
        (catch Throwable e
          ;; rethrow e if it's not an InterruptedException, we're not interested in it.
          (when-not (interrupted-exception? e)
            (throw e))
          ;; ok, at this point we know it's an InterruptedException.
          (log/trace e "Caught InterruptedException when executing query, this means the query was canceled. Ignoring exception.")
          ;; just to be extra safe and sure that the canceled chan has gotten a message. It's a promise channel so
          ;; duplicate messages don't matter
          (some-> *canceled-chan* (a/>!! ::cancel))
          ::cancel)))))

(def ^:dynamic ^Long *query-timeout-ms*
  "Maximum amount of time query is allowed to run, in ms."
  (u/minutes->ms (driver.u/db-query-timeout-minutes)))
