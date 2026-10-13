(ns metabase.query-processor.pipeline
  (:require
   [clojure.core.async :as a]
   [metabase.analytics-interface.core :as analytics]
   [metabase.driver :as driver]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *pivot?*
  "True while [[metabase.query-processor.pivot]] is re-running its generated sub-queries through the query processor.
  These sub-queries carry internal `:qp.pivot/*` keys and already-derived annotations, so preprocessing must not strip
  internal keys from them."
  false)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^clojure.core.async.impl.channels.ManyToManyChannel *canceled-chan*
  "If this channel is bound, you can send it a message to cancel the query. You can check if it has received a message
  to see if the query has been canceled.

  This should be bound to a [[clojure.core.async/promise-chan]] so it can be polled freely without messages being
  consumed."
  nil)

(defn canceled?*
  "Whether the corresponding query execution has been canceled. This is usually triggered by an HTTP connection closing when
  running queries from the REST API. Generally prefer `canceled?`."
  [canceled-chan]
  (some-> canceled-chan a/poll!))

(defn canceled?
  "Whether the current query execution has been canceled. This is usually triggered by an HTTP connection closing when
  running queries from the REST API; you should check this before or while doing something expensive (such as before
  running the query against a data warehouse) to avoid doing work for queries that have been canceled."
  []
  (canceled?* *canceled-chan*))

(defn do-with-own-canceled-chan
  "Call `thunk` with [[*canceled-chan*]] bound to a new channel, which is canceled when `outer-chan` is.
  Without `outer-chan` that is the current [[*canceled-chan*]]. When there is no outer channel, `thunk` runs with
  the binding as it is.

  Use this for a query that runs while another one is in progress, and for each of several queries that one channel
  can cancel. A query closes [[*canceled-chan*]] when it finishes, and on a shared channel a query in progress, or
  a later one, would then never hear that it was canceled or timed out.

  `outer-chan` must keep its value for every reader, as a promise channel does."
  ([thunk]
   (do-with-own-canceled-chan *canceled-chan* thunk))
  ([outer-chan thunk]
   (if outer-chan
     (let [own-chan  (a/promise-chan)
           done-chan (a/promise-chan)]
       (a/go
         (let [[value port] (a/alts! [outer-chan done-chan])]
           (when (and (= port outer-chan) (some? value))
             (a/>! own-chan value))))
       (try
         (binding [*canceled-chan* own-chan]
           (thunk))
         (finally
           (a/close! own-chan)
           (a/close! done-chan))))
     (thunk))))

(defn default-result-handler
  "Default implementation for *result*."
  [result]
  (if (instance? Throwable result)
    (throw result)
    result))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(defn ^:dynamic *result*
  "Called exactly once with the final result, which is the result of either [[*reduce*]] (if query completed
  successfully), or an Exception (if it did not)."
  [result]
  (default-result-handler result))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(defn ^:dynamic *execute*
  "Called by [[*run*]] to have driver run query. By default, [[metabase.driver/execute-reducible-query]]. `respond` is a
  callback with the signature:

    (respond results-metadata reducible-rows)

  The implementation should call `respond` with this information once it is available. `response` MUST BE CALLED
  SYNCHRONOUSLY, and [[*execute*]] should ultimately return whatever it returns."
  [driver query respond]
  (if (canceled?)
    (do
      (log/trace "Query was cancelled before driver execution started")
      nil)
    ;; Normal execution path
    (let [context {:canceled-chan *canceled-chan*}]
      (driver/execute-reducible-query driver query context respond))))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(defn ^:dynamic *reduce*
  "Called by [[*run*]] (inside the `respond` callback provided by it) to reduce results of query. Reduces results, then
  calls [[*result*]] with the reduced results."
  [rff metadata reducible-rows]
  (if (canceled?)
    (do
      (log/trace "Query was cancelled before reduction started")
      nil)
    ;; Normal execution path
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
                                                          (analytics/inc! :metabase-query-processor/query
                                                                          {:driver driver/*driver* :status "success"})
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

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(defn ^:dynamic *run*
  "Function for running the query. Calls [[*execute*]], then [[*reduce*]] on the results."
  [query rff]
  (if (canceled?)
    (do
      (log/trace "Query was cancelled before execution started")
      nil)
    ;; Normal execution path
    (letfn [(respond [metadata reducible-rows]
              (*reduce* rff metadata reducible-rows))]
      (try
        (*execute* driver/*driver* query respond)
        (catch Throwable e
          ;; rethrow e if it's not an InterruptedException, we're not interested in it.
          (when-not (interrupted-exception? e)
            (throw e))
          ;; ok, at this point we know it's an InterruptedException.
          (log/trace "Caught InterruptedException when executing query, this means the query was canceled. Ignoring exception.")
          ;; just to be extra safe and sure that the canceled chan has gotten a message. It's a promise channel so
          ;; duplicate messages don't matter
          (some-> *canceled-chan* (a/>!! ::cancel))
          nil)))))
