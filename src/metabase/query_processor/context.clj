(ns metabase.query-processor.context
  "Interface for the QP context/utility functions for using the things in the context correctly.

  ## Sync Contexts

  Normal sync flow is something like:

    [middleware] → runf → executef → reducef --+
        ↓                                      |-> resultf
    [Exception]  → raisef ---------------------+    ↑
                                                    | ::cancel
                                 canceled-chan -----+
                                      ↑
                       [message sent to canceled chan]

  1. ::qp.schema/query normally runs thru middleware and then a series of context functions as described above; result
     is sent thru [[resultf]]; this is the overall result of the QP

  2. If an `Exception` is thrown, it is sent thru [[raisef]] and then to [[resultf]]

  3. If the query is canceled (by sending [[canceled-chan]] a message), [[resultf]] is immediately called with the
     value `::cancel`

  ## Async Contexts

  Largely similar with a few extra things going on:

  Normal ASYNC flow is something like:

    [middleware] → runf → executef → reducef -+
        ↓                                     |----> resultf → out-chan
    [Exception]  → raisef --------------------+         ↑
                     ↑                                  |
                     |                                  |
                 [time out]    [out-chan closed early]  |
                                         ↓              | ::cancel
                                    canceled-chan ------+
                                         ↑
                          [message sent to canceled chan]

  1. Query returns a core.async promise channel, [[out-chan]], after query is preprocessed and compiled; query is
     executed on a separate thread. You can poll [[out-chan]] for the query results.

  2. If [[out-chan]] is closed before receiving a result, it will trigger query cancellation.

  3. Query cancellation will cancel the query execution happening on the separate thread."
  (:require
   [clojure.core.async :as a]
   [metabase.async.util :as async.u]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

(p/defprotocol+ Context
  (raisef [context e]
    "Raise an Exception.")

  (runf [context query rff]
    "Normally, this simply calls [[executef]], but you can override this for test purposes. The result of this function is
  ignored.")

  (executef [context driver query respond]
    "Called by [[runf]] to have driver run query. By default, [[metabase.driver/execute-reducible-query]]. `respond` is a
  callback with the signature:

    (respond results-metadata reducible-rows)

  The implementation of [[executef]] should call `respond` with this information once it is available. The result of
  this function is ignored.")

  ;; TODO -- not sure why we need [[reducef]], can't anything that happens there be done in the `rff`?

  (reducef [context rff metadata reducible-rows]
    "Called by [[runf]] (inside the `respond` callback provided by it) to reduce results of query. Reduces results, then
  calls [[resultf]] with the reduced results. results.")

  (resultf [context result]
    "Called exactly once with the final result, which is the result of either [[reducef]] or [[raisef]].")

  (timeout [context]
    "Maximum amount of time query is allowed to run, in ms.")

  ;; TODO -- consider whether this should be part of [[AsyncContext]].
  (canceled-chan [context]
    "Core.async promise channel that you can send a message to poll. Gets a message if a query is canceled."))

(p/defprotocol+ AsyncContext
  (out-chan [context]
    "Core.async promise channel that gets a message with the final result. Final result may be a Throwable. Closing this
    channel before it receives a result will cancel the query."))

(mr/def ::timeout-ms
  ::lib.schema.common/positive-int)

(mr/def ::context
  [:fn
   {:error/message "Valid QP Context"}
   #(satisfies? Context %)])

(mr/def ::context.async
  [:and
   ::context
   [:fn
    {:error/message "Valid QP async context"}
    #(satisfies? AsyncContext %)]])

;;; these aliases are mostly to make the function signature schemas below a little clearer.
(mr/def ::driver         :keyword)
(mr/def ::reducible-rows :some)
(mr/def ::reduced-rows   :some)
(mr/def ::result         :some)

(mr/def ::respond
  [:=>
   [:cat ::qp.schema/metadata ::reducible-rows]
   :some])

(mu/defn ^:private -raisef :- :any
  [context :- ::context
   e       :- (ms/InstanceOfClass Throwable)]
  ((:raisef context) context e))

(mu/defn ^:private -runf :- :some
  [context :- ::context
   query   :- ::qp.schema/query
   rff     :- ::qp.schema/rff]
  ((:runf context) context query rff))

(mu/defn ^:private -executef :- :some
  [context :- ::context
   driver  :- ::driver
   query   :- ::qp.schema/query
   respond :- ::respond]
  ((:executef context) context driver query respond))

(mu/defn ^:private -reducef :- ::reduced-rows
  [context        :- ::context
   rff            :- ::qp.schema/rff
   metadata       :- ::qp.schema/metadata
   reducible-rows :- ::reducible-rows]
  ((:reducef context) context rff metadata reducible-rows))

(mu/defn ^:private -resultf :- :some
  [context :- ::context
   result  :- ::result]
  ((:resultf context) context result))

(mu/defn ^:private -timeout :- ::timeout-ms
  [context :- ::context]
  (:timeout context))

;;; TODO NOCOMMIT FIXME -- I think we need to defer wiring this up for even longer, maybe until the query actually
;;; starts executing. It's a problem that it's capturing context this early. Either that or context needs to be mutable.
(mu/defn ^:private make-canceled-chan :- async.u/PromiseChan
  [context :- ::context]
  (let [chan    (a/promise-chan)
        context (assoc context :canceled-chan chan)]
    ;; if canceled chan gets a message, close it and then pass a `::cancel` message to [[resultf]].
    (a/go
      (when (a/<! chan)
        (a/close! chan)
        (resultf context ::cancel)))
    chan))

(mu/defn ^:private -canceled-chan :- async.u/PromiseChan
  "Wiring up of the canceled chan is deferred until the first time you access it, that way we can be sure we have a
  finalized context."
  [context            :- ::context
   canceled-chan-atom :- (ms/InstanceOfClass clojure.lang.IAtom)]
  (or @canceled-chan-atom
      (locking canceled-chan-atom
        (or @canceled-chan-atom
            (let [chan (make-canceled-chan context)]
              (reset! canceled-chan-atom chan)
              chan)))))

;;;
;;; Sync Context
;;;

(p/defrecord+ SyncContextImpl [-deferred-canceled-chan]
  Context
  (raisef [this e]
    (-raisef this e))
  (runf [this query rff]
    (-runf this query rff))
  (executef [this driver query respond]
    (-executef this driver query respond))
  (reducef [this rff metadata reducible-rows]
    (-reducef this rff metadata reducible-rows))
  (resultf [this result]
    (-resultf this result))
  (timeout [this]
    (-timeout this))
  (canceled-chan [this]
    (-canceled-chan this -deferred-canceled-chan)))

(def query-timeout-ms
  "Maximum amount of time to wait for a running query to complete before throwing an Exception."
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  (u/minutes->ms
   (if config/is-prod?
     20
     3)))

(mu/defn ^:private default-raisef
  [context :- ::context
   e       :- (ms/InstanceOfClass Throwable)]
  (resultf context e))

(mu/defn ^:private canceled? [context :- ::context]
  (a/poll! (canceled-chan context)))

(mu/defn ^:private sync-runf :- :some
  [context :- ::context
   query   :- ::qp.schema/query
   rff     :- ::qp.schema/rff]
  (assert driver/*driver* "driver/*driver* should be bound")
  (when-not (canceled? context)
    (letfn [(respond [metadata reducible-rows]
              (reducef context rff metadata reducible-rows))]
      (try
        (executef context driver/*driver* query respond)
        (catch InterruptedException e
          (log/tracef e "Caught InterruptedException when executing query, this means the query was canceled. Ignoring exception.")
          ::cancel)
        (catch Throwable e
          (raisef context e))))))

(mu/defn ^:private default-executef :- :some
  [context :- ::context
   driver  :- ::driver
   query   :- ::qp.schema/query
   respond :- ::respond]
  (when-not (canceled? context)
    (driver/execute-reducible-query driver query context respond)))

(mu/defn ^:private default-reducef :- ::reduced-rows
  [context        :- ::context
   rff            :- ::qp.schema/rff
   metadata       :- ::qp.schema/metadata
   reducible-rows :- ::reducible-rows]
  (when-not (canceled? context)
    (let [rf              (try
                            (rff metadata)
                            (catch Throwable e
                              (raisef context
                                      (ex-info (i18n/tru "Error building query results reducing function: {0}" (ex-message e))
                                               {:type qp.error-type/qp}
                                               e))))
          [status result] (try
                            [::success (transduce identity rf reducible-rows)]
                            (catch Throwable e
                              [::error (raisef context
                                               (ex-info (i18n/tru "Error reducing result rows: {0}" (ex-message e))
                                                        {:type qp.error-type/qp}
                                                        e))]))]
      (case status
        ::success (resultf context result)
        ::error   result))))

(mu/defn ^:private sync-resultf :- :some
  [context :- ::context
   result  :- :some]
  (a/close! (canceled-chan context))
  (if (instance? Throwable result)
    (throw result)
    result))

(def ^:private base-sync-context-impl
  {:timeout       query-timeout-ms
   :raisef        #'default-raisef
   :runf          #'sync-runf
   :executef      #'default-executef
   :reducef       #'default-reducef
   :resultf       #'sync-resultf})

(mu/defn sync-context :- [:and
                          ::context
                          (ms/InstanceOfClass SyncContextImpl)]
  "Create a new synchronous QP context. A synchronous context will execute the query on the current thread and block
  until it has been completed, and return its results directly.

  Note that passing in an async context will not magically turn it into a synchronous context."
  ([]
   (sync-context nil))

  ([overrides :- [:maybe :map]]
   (map->SyncContextImpl
    (merge base-sync-context-impl
           (dissoc overrides :canceled-chan)
           {:-deferred-canceled-chan (atom (:canceled-chan overrides))}))))

;;;
;;; Async context
;;;

(mu/defn ^:private handle-async-timeout :- :any
  [context :- ::context]
  (let [timeout (timeout context)]
    (log/debugf "Query timed out after %s, raising timeout exception." (u/format-milliseconds timeout))
    (raisef context
            (ex-info (i18n/tru "Timed out after {0}." (u/format-milliseconds timeout))
                     {:status :timed-out
                      :type   qp.error-type/timed-out}))))

(mu/defn ^:private make-async-out-chan :- async.u/PromiseChan
  "Wire up the core.async channels in a QP `context`:

  1. If query doesn't complete by [[qp.context/timeout]], call [[handle-async-timeout]], which will raise an Exception.

  2. When [[qp.context/out-chan]] is closed prematurely, send a message to [[qp.context/canceled-chan]].

  3. When [[qp.context/out-chan]] is closed or gets a result, close both [[qp.context/out-chan]]
     and [[qp.context/canceled-chan]]."
  [context :- ::context]
  (let [out-chan      (a/promise-chan)
        context       (assoc context :out-chan out-chan)
        canceled-chan (canceled-chan context)
        timeout-chan  (a/timeout (timeout context))]
    (a/go
      (let [[val port] (a/alts! [out-chan timeout-chan] :priority true)]
        (log/tracef "Port %s got %s"
                    (if (= port out-chan) "out-chan" (format "timeout-chan (%s)" (u/format-milliseconds timeout)))
                    val)
        (cond
          (= port timeout-chan) (handle-async-timeout context)
          (nil? val)            (a/>!! canceled-chan ::cancel))
        (log/tracef "Closing out-chan.")
        (a/close! out-chan)
        (a/close! canceled-chan)))
    out-chan))

(mu/defn ^:private -out-chan :- async.u/PromiseChan
  "Wiring up of out-chan is deferred until the first time you access it, that way we can be sure we have a finalized
  context."
  [context       :- ::context
   out-chan-atom :- (ms/InstanceOfClass clojure.lang.IAtom)]
  (or @out-chan-atom
      (locking out-chan-atom
        (or @out-chan-atom
            (let [chan (make-async-out-chan context)]
              (reset! out-chan-atom chan)
              chan)))))

(p/defrecord+ AsyncContextImpl [-deferred-canceled-chan -deferred-out-chan]
  Context
  (raisef [this e]
    (-raisef this e))
  (runf [this query rff]
    (-runf this query rff))
  (executef [this driver query respond]
    (-executef this driver query respond))
  (reducef [this rff metadata reducible-rows]
    (-reducef this rff metadata reducible-rows))
  (resultf [this result]
    (-resultf this result))
  (timeout [this]
    (-timeout this))
  (canceled-chan [this]
    (-canceled-chan this -deferred-canceled-chan))

  AsyncContext
  (out-chan [this]
    (-out-chan this -deferred-out-chan)))

(mu/defn ^:private async-runf :- async.u/PromiseChan
  [context :- ::context.async
   query   :- ::qp.schema/query
   rff     :- ::qp.schema/rff]
  (let [futur         (.submit clojure.lang.Agent/pooledExecutor
                               ^Runnable (bound-fn*
                                          (^:once fn* []
                                           (sync-runf context query rff))))
        canceled-chan (canceled-chan context)]
    ;; if query is canceled, cancel the future executing the query in the background thread.
    (a/go
      (when (some? (a/<! canceled-chan))
        (try
          (future-cancel futur)
          (catch Throwable e
            (log/warnf e "Error canceling future in async QP context: %s" (ex-message e)))))))
  (out-chan context))

(mu/defn ^:private async-resultf :- async.u/PromiseChan
  [context :- ::context.async
   result  :- :some]
  (log/tracef "Async context resultf got result\n%s" (pr-str result))
  (a/close! (canceled-chan context))
  (let [out-chan (out-chan context)]
    (a/>!! out-chan result)
    (a/close! out-chan)
    out-chan))

(def ^:private base-async-context-impl
  (merge base-sync-context-impl
         {:runf    #'async-runf
          :resultf #'async-resultf}))

(mu/defn async-context :- [:and
                           ::context.async
                           (ms/InstanceOfClass AsyncContextImpl)]
  "Create a new asynchronous context. Queries are preprocessed and compiled synchronously, but when we are ready to
  execute the query, a core.async promise channel is returned immediately. The query will be executed asynchronously on
  a background thread. The core.async channel will eventually receive the reduced results (or Exception, if one was
  encountered). Closing the core.async channel before the query finishes will cancel the query."
  ([]
   (async-context nil))

  ([overrides :- [:maybe :map]]
   (map->AsyncContextImpl
    (merge base-async-context-impl
           (dissoc overrides :canceled-chan :out-chan)
           {:-deferred-canceled-chan (atom (:canceled-chan overrides))
            :-deferred-out-chan      (atom (:out-chan overrides))}))))
