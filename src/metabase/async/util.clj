(ns metabase.async.util
  "Utility functions for core.async-based async logic."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [schema.core :as s])
  (:import clojure.core.async.impl.buffers.PromiseBuffer
           clojure.core.async.impl.channels.ManyToManyChannel
           java.util.concurrent.ThreadPoolExecutor))

;; TODO - most of this stuff can be removed now that we have the new-new reducible/async QP implementation of early
;; 2020. No longer needed

(defn promise-chan?
  "Is core.async `chan` a `promise-chan`?"
  [chan]
  (and (instance? ManyToManyChannel chan)
       (instance? PromiseBuffer (.buf ^ManyToManyChannel chan))))

(def PromiseChan
  "Schema for a core.async promise channel."
  (s/constrained ManyToManyChannel promise-chan? "promise chan"))

(s/defn promise-pipe
  "Like `core.async/pipe` but for promise channels, and closes `in-chan` if `out-chan` is closed before receiving a
  result. Closes both channels when `in-chan` closes or receives a result."
  [in-chan :- PromiseChan, out-chan :- PromiseChan]
  (a/go
    (let [[val port] (a/alts! [in-chan out-chan] :priority true)]
      ;; forward any result of `in-chan` to `out-chan`.
      (when (and (= port in-chan)
                 (some? val))
        (a/>! out-chan val))
      ;; Close both channels once either gets a result or is closed.
      (a/close! in-chan)
      (a/close! out-chan)))
  nil)

(defn cancelable-thread-call
  "Exactly like `a/thread-call`, with two differences:

    1) the result channel is a promise channel instead of a regular channel
    2) Closing the result channel early will cancel the async thread call."
  [f]
  ;; create two channels:
  ;; * `done-chan` will always get closed immediately after `(f)` is finished
  ;; * `result-chan` will get the result of `(f)`, *after* `done-chan` is closed
  (let [done-chan   (a/promise-chan)
        result-chan (a/promise-chan)
        f*          (bound-fn []
                      (let [result (try
                                     (f)
                                     (catch Throwable e
                                       (log/trace e "cancelable-thread-call: caught exception in f")
                                       e))]
                        (a/close! done-chan)
                        (when (some? result)
                          (a/>!! result-chan result)))
                      (a/close! result-chan))
        futur       (.submit ^ThreadPoolExecutor (var-get (resolve 'clojure.core.async/thread-macro-executor)) ^Runnable f*)]
    ;; if `result-chan` gets a result/closed *before* `done-chan`, it means it was closed by the caller, so we should
    ;; cancel the thread running `f*`
    (a/go
      (let [[_ port] (a/alts! [done-chan result-chan] :priority true)]
        (when (= port result-chan)
          (log/trace "cancelable-thread-call: result channel closed before f finished; canceling thread")
          (future-cancel futur))))
    result-chan))

(defmacro cancelable-thread
  "Exactly like `a/thread`, with two differences:

    1) the result channel is a promise channel instead of a regular channel
    2) Closing the result channel early will cancel the async thread call."
  {:style/indent 0}
  [& body]
  `(cancelable-thread-call (fn [] ~@body)))
