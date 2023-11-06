(ns metabase.query-processor.context
  "Interface for the QP context/utility functions for using the things in the context correctly."
  (:require
   [clojure.core.async :as a]
   [metabase.async.util :as async.u]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::timeout-ms
  ::lib.schema.common/positive-int)

(mr/def ::context
  [:map
   [:timeout       ::timeout-ms]
   [:raisef        [:ref ::raisef]]
   [:runf          [:ref ::runf]]
   [:executef      [:ref ::executef]]
   [:reducef       [:ref ::reducef]]
   [:reducedf      [:ref ::reducedf]]
   [:timeoutf      [:ref ::timeoutf]]
   [:resultf       [:ref ::resultf]]
   [:canceled-chan async.u/PromiseChan]])

(mr/def ::context.async
  [:merge
   [:ref ::context]
   [:map
    [:out-chan async.u/PromiseChan]]])

;;; these aliases are mostly to make the function signature schemas below a little clearer.
(mr/def ::query          :map)
(mr/def ::driver         :keyword)
(mr/def ::metadata       :any)
(mr/def ::reducible-rows :some)
(mr/def ::reduced-rows   :some)
(mr/def ::result         :some)

(mr/def ::rff
  [:=>
   [:cat ::metadata]
   [:function
    [:=> [:cat]           :any]
    [:=> [:cat :any]      :any]
    [:=> [:cat :any :any] :any]]])

(mr/def ::raisef
  [:=>
   [:cat (ms/InstanceOfClass Throwable) ::context]
   :any])

(mr/def ::runf
  [:=>
   [:cat ::query ::rff ::context]
   :some])

(mr/def ::respond
  [:=>
   [:cat ::metadata ::reducible-rows]
   :some])

(mr/def ::executef
  [:=>
   [:cat ::driver ::query ::context ::respond]
   :some])

(mr/def ::reducef
  [:=>
   [:cat ::rff ::context ::metadata ::reducible-rows]
   ::reduced-rows])

(mr/def ::reducedf
  [:=>
   [:cat ::reduced-rows ::context]
   ::result])

(mr/def ::timeoutf
  [:=>
   [:cat ::context]
   :any])

(mr/def ::resultf
  [:=>
   [:cat ::result ::context]
   :any])

;; Normal flow is something like:
;;
;;    [middleware] → runf → executef → reducef → reducedf -\
;;        ↓                                                 ↦ resultf → out-chan
;;    [Exception]  → raisef -------------------------------/               ↑
;;        ↑                                                                |
;;     timeoutf                                                            |
;;        ↑                                                                |
;;    [time out]              [out-chan closed early]                      |
;;                                      ↓                         [closes] |
;;                                 canceled-chan --------------------------/
;;                                      ↑
;;                       [message sent to canceled chan]
;;
;; 1. ::query normally runs thru middleware and then a series of context functions as described above; result is sent thru
;;    [[resultf]] and finally to [[out-chan]]
;;
;; 2. If an `Exception` is thrown, it is sent thru [[raisef]], [[resultf]] and finally to [[out-chan]]
;;
;; 3. If the query times out, `timeoutf` throws an Exception
;;
;; 4. If the query is canceled (either by closing [[out-chan]] before it gets a result, or by sending [[canceled-chan]]
;;    a message), the execution is canceled and [[out-chan]] is closed (if not already closed).

(mu/defn raisef :- :any
  "Raise an Exception."
  [e       :- (ms/InstanceOfClass Throwable)
   context :- ::context]
  ((:raisef context) e context))

(mu/defn runf :- :some
  "Called by the [[metabase.query-processor.reducible/identity-qp]] fn to run preprocessed query. Normally, this simply
  calls [[executef]], but you can override this for test purposes. The result of this function is ignored."
  [query   :- ::query
   rff     :- ::rff
   context :- ::context]
  ((:runf context) query rff context))

(mu/defn executef :- :some
  "Called by [[runf]] to have driver run query. By default, [[metabase.driver/execute-reducible-query]]. `respond` is a
  callback with the signature:

    (respond results-metadata reducible-rows)

  The implementation of [[executef]] should call `respond` with this information once it is available. The result of
  this function is ignored."
  [driver  :- ::driver
   query   :- ::query
   context :- ::context
   respond :- ::respond]
  ((:executef context) driver query context respond))

(mu/defn reducef :- ::reduced-rows
  "Called by [[runf]] (inside the `respond` callback provided by it) to reduce results of query. [[reducedf]] is called
  with the reduced results. The actual output of this function is ignored, but the entire result set must be reduced
  and passed to [[reducedf]] before this function completes."
  [rff            :- ::rff
   context        :- ::context
   metadata       :- ::metadata
   reducible-rows :- ::reducible-rows]
  ((:reducef context) rff context metadata reducible-rows))

(mu/defn reducedf :- ::result
  "Called in [[reducedf]] with fully reduced results. This result is passed to [[resultf]]."
  [reduced-rows :- ::reduced-rows
   context      :- ::context]
  ((:reducedf context) reduced-rows context))

(mu/defn timeoutf :- :any
  "Call this function when a query times out."
  [context :- ::context]
  ((:timeoutf context) context))

(mu/defn resultf :- :some
  "Called exactly once with the final result, which is the result of either [[reducedf]] or [[raisef]]."
  [result  :- ::result
   context :- ::context]
  ((:resultf context) result context))

(mu/defn timeout :- ::timeout-ms
  "Maximum amount of time query is allowed to run, in ms."
  [context :- ::context]
  (:timeout context))

(mu/defn canceled-chan :- async.u/PromiseChan
  "Gets a message if query is canceled."
  [context :- ::context]
  (:canceled-chan context))

(mu/defn out-chan :- async.u/PromiseChan
  "Gets a message with the final result."
  [context :- ::context.async]
  (:out-chan context))

(def query-timeout-ms
  "Maximum amount of time to wait for a running query to complete before throwing an Exception."
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  (u/minutes->ms
   (if config/is-prod?
     20
     3)))

(defn- default-raisef [e context]
  (resultf e context))

(defn- canceled? [context]
  (a/poll! (canceled-chan context)))

(defn- sync-runf [query rff context]
  (assert driver/*driver* "driver/*driver* should be bound")
  (when-not (canceled? context)
    (letfn [(respond [metadata reducible-rows]
              (reducef rff context metadata reducible-rows))]
      (try
        (executef driver/*driver* query context respond)
        (catch Throwable e
          (raisef e context))))))

(defn- default-executef [driver query context respond]
  (when-not (canceled? context)
    (driver/execute-reducible-query driver query context respond)))

(mu/defn ^:private default-reducef :- ::reduced-rows
  [rff            :- ::rff
   context        :- ::context
   metadata       :- ::metadata
   reducible-rows :- ::reducible-rows]
  (when-not (canceled? context)
    (let [rf              (try
                            (rff metadata)
                            (catch Throwable e
                              (raisef (ex-info (i18n/tru "Error building query results reducing function: {0}" (ex-message e))
                                               {:type qp.error-type/qp}
                                               e)
                                      context)))
          [status result] (try
                            [::success (transduce identity rf reducible-rows)]
                            (catch Throwable e
                              [::error (raisef (ex-info (i18n/tru "Error reducing result rows: {0}" (ex-message e))
                                                        {:type qp.error-type/qp}
                                                        e)
                                               context)]))]
      (case status
        ::success (reducedf result context)
        ::error   result))))

(mu/defn ^:private default-reducedf :- :some
  [reduced-result :- :some
   context        :- ::context]
  (resultf reduced-result context))

(defn- default-timeoutf
  [context]
  (let [timeout (timeout context)]
    (log/debugf "::query timed out after %s, raising timeout exception." (u/format-milliseconds timeout))
    (raisef (ex-info (i18n/tru "Timed out after {0}." (u/format-milliseconds timeout))
                     {:status :timed-out
                      :type   qp.error-type/timed-out})
            context)))

(mu/defn ^:private sync-resultf :- :some
  [result  :- :some
   context :- ::context]
  (a/close! (canceled-chan context))
  (if (instance? Throwable result)
    (throw result)
    result))

(def ^:private base-sync-context
  {:timeout  query-timeout-ms
   :raisef   #'default-raisef
   :runf     #'sync-runf
   :executef #'default-executef
   :reducef  #'default-reducef
   :reducedf #'default-reducedf
   :timeoutf #'default-timeoutf
   :resultf  #'sync-resultf
   ::type    ::sync})

(mu/defn ^:private make-canceled-chan :- async.u/PromiseChan
  [context]
  (let [chan (a/promise-chan)]
    (a/go
      (when (a/<! chan)
        (a/close! chan)
        (resultf ::timed-out context)))
    chan))

(mu/defn sync-context :- ::context
  "Create a new synchronous QP context. A synchronous context will execute the query on the current thread and block
  until it has been completed, and return its results directly.

  Note that passing in an async context will not magically turn it into a synchronous context."
  ([]
   (sync-context nil))

  ([overrides :- [:maybe :map]]
   (let [context (merge base-sync-context overrides)]
     (cond-> context
       (not (:canceled-chan context)) (assoc :canceled-chan (make-canceled-chan context))))))

(defn- async-runf [query rff context]
  (let [futur         (.submit clojure.lang.Agent/pooledExecutor
                               ^Runnable (bound-fn*
                                          (^:once fn* []
                                           (sync-runf query rff context))))
        canceled-chan (canceled-chan context)]
    (a/go
      (when (some? (a/<! canceled-chan))
        (future-cancel futur))))
  (out-chan context))

(defn- async-resultf [result context]
  (a/close! (canceled-chan context))
  (a/>!! (out-chan context) result)
  (a/close! out-chan)
  (if (instance? Throwable result)
    (throw result)
    result))

(def ^:private base-async-context
  (merge base-sync-context
         {:runf    #'async-runf
          :resultf #'async-resultf
          ::type   ::async}))

(mu/defn ^:private make-async-out-chan :- async.u/PromiseChan
  "Wire up the core.async channels in a QP `context`

  1. If query doesn't complete by [[qp.context/timeout]], call [[qp.context/timeoutf]], which should raise an Exception.

  2. When [[qp.context/out-chan]] is closed prematurely, send a message to [[qp.context/canceled-chan]].

  3. When [[qp.context/out-chan]] is closed or gets a result, close both [[qp.context/out-chan]]
     and [[qp.context/canceled-chan]]."
  [context]
  (let [out-chan      (a/promise-chan)
        canceled-chan (canceled-chan context)
        timeout-chan  (a/timeout (timeout context))]
    (a/go
      (let [[val port] (a/alts! [out-chan timeout-chan] :priority true)]
        (log/tracef "Port %s got %s"
                    (if (= port out-chan) "out-chan" (format "[timeout after %s]" (u/format-milliseconds timeout)))
                    val)
        (cond
          (not= port out-chan) (timeoutf context)
          (nil? val)           (a/>!! canceled-chan ::cancel))
        (log/tracef "Closing out-chan.")
        (a/close! out-chan)
        (a/close! canceled-chan)))
    out-chan))

(mu/defn async-context :- ::context.async
  "Create a new asynchronous context. Queries are preprocessed and compiled synchronously, but when we are ready to
  execute the query, a core.async promise channel is returned immediately. The query will be executed asynchronously on
  a background thread. The core.async channel will eventually receive the reduced results (or Exception, if one was
  encountered). Closing the core.async channel before the query finishes will cancel the query."
  ([]
   (async-context nil))

  ([overrides :- [:maybe :map]]
   (let [context (merge base-async-context overrides)
         context (cond-> context
                   (not (:canceled-chan context)) (assoc :canceled-chan (make-canceled-chan context)))]
     (cond-> context
       (not (:out-chan context)) (assoc :out-chan (make-async-out-chan context))))))
