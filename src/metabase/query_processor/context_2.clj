(ns metabase.query-processor.context-2
  (:require
   [clojure.core.async :as a]
   [potemkin :as p]
   [pretty.core :as pretty]))

(set! *warn-on-reflection* true)

(p/defprotocol+ Context
  (cancel [this])
  (execute [this thunk])
  (respond [this result])
  (raise [this e]))

(defn Context? [context]
  (satisfies? Context context))

(def ContextInstance
  [:fn {:error/message "QP Context"}
   #'Context?])

(defn sync-context []
  (reify
    Context
    (cancel [_this]
      nil)
    (execute [this thunk]
      (try
        (respond this (thunk))
        (catch Throwable e
          (raise this e))))
    (respond [_this result]
      result)
    (raise [_this e]
      (throw e))

    pretty/PrettyPrintable
    (pretty [_this]
      `(sync-context))))

(defn- async-context-cancel [state]
  (let [{:keys [result-chan futur]} @state]
    (when result-chan
      (a/>!! result-chan ::cancelled)
      (a/close! result-chan))
    (when futur
      (future-cancel futur)))
  nil)

(defn- async-context-execute [context state thunk]
  (let [result-chan (a/promise-chan)]
    ;; sort of important to make sure this is in place BEFORE submitting the thunk, that way if it returns immediately
    ;; or whatever it has a channel to send results to.
    (swap! state assoc :result-chan result-chan)
    ;; if result-chan is closed before receiving a value, call [[cancel]] to cancel the currently-running query.
    (a/go
      (when-not [val (a/<! result-chan)]
        (cancel context)))
    (let [^Runnable thunk' (^:once fn* []
                            (try
                              (respond context (thunk))
                              (catch Throwable e
                                (raise context e))))]
      (swap! state assoc :futur (.submit clojure.lang.Agent/pooledExecutor thunk')))
    result-chan))

(defn- async-context-respond [state result]
  (let [{:keys [result-chan]} @state]
    (assert result-chan)
    (a/>!! result-chan result)
    (a/close! result-chan))
  nil)

(defn- async-context-raise [state e]
  (if-let [result-chan (:result-chan @state)]
    (do
      (a/>!! result-chan e)
      (a/close! result-chan)
      nil)
    (throw e)))

(defn async-context []
  (let [state (atom nil)]
    (reify
      Context
      (cancel  [_this]        (async-context-cancel state))
      (execute [this thunk]   (async-context-execute this state thunk))
      (respond [_this result] (async-context-respond state result))
      (raise   [_this e]      (async-context-raise state e))

      pretty/PrettyPrintable
      (pretty [_this]
        `(async-context)))))

(defn cancelling-context [parent-context on-cancel]
  (reify
    Context
    (cancel [_this]
      (on-cancel)
      (cancel parent-context))
    (execute [_this thunk]
      (execute parent-context thunk))
    (respond [_this result]
      (respond parent-context result))
    (raise [_this e]
      (raise parent-context e))

    pretty/PrettyPrintable
    (pretty [_this]
      (list `cancelling-context parent-context on-cancel))))

(defn cancel-chan-context
  "Returns a pair like

    [cancel-chan context]"
  [parent-context]
  (let [cancel-chan (a/promise-chan)
        context     (reify
                      Context
                      (cancel [_this]
                        (a/>!! cancel-chan ::cancelled)
                        (a/close! cancel-chan)
                        (cancel parent-context))
                      (execute [_this thunk]
                        (execute parent-context thunk))
                      (respond [_this result]
                        (a/close! cancel-chan)
                        (respond parent-context result))
                      (raise [_this e]
                        (a/close! cancel-chan)
                        (raise parent-context e))

                      pretty/PrettyPrintable
                      (pretty [_this]
                        (list `cancel-chan-context parent-context)))]
    [cancel-chan context]))
