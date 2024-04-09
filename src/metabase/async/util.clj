(ns metabase.async.util
  "Utility functions for core.async-based async logic."
  (:require
   [clojure.core.async :as a]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.core.async.impl.buffers PromiseBuffer)
   (clojure.core.async.impl.channels ManyToManyChannel)
   (java.util.concurrent ThreadPoolExecutor)))

(set! *warn-on-reflection* true)

;; TODO - most of this stuff can be removed now that we have the new-new reducible/async QP implementation of early
;; 2020. No longer needed

(defn promise-chan?
  "Is core.async `chan` a `promise-chan`?"
  [chan]
  (and (instance? ManyToManyChannel chan)
       (instance? PromiseBuffer (.buf ^ManyToManyChannel chan))))

(def PromiseChan
  "Malli schema for a core.async promise channel."
  [:and
   (ms/InstanceOfClass ManyToManyChannel)
   [:fn
    {:error/message "A core.async promise channel"}
    promise-chan?]])

(defn cancelable-thread-call
  "Exactly like `a/thread-call`, with two differences:

    1) the result channel is a promise channel instead of a regular channel
    2) Closing the result channel early will cancel the async thread call."
  [thunk]
  ;; create two channels:
  ;; * `done-chan` will always get closed immediately after `(f)` is finished
  ;; * `result-chan` will get the result of `(f)`, *after* `done-chan` is closed
  (let [done-chan   (a/promise-chan)
        result-chan (a/promise-chan)
        binds       (clojure.lang.Var/getThreadBindingFrame)
        thunk*      (^:once fn* []
                      (clojure.lang.Var/resetThreadBindingFrame binds)
                      (let [result (try
                                     (thunk)
                                     (catch Throwable e
                                       (log/trace e "cancelable-thread-call: caught exception in f")
                                       e))]
                        (a/close! done-chan)
                        (when (some? result)
                          (a/>!! result-chan result)))
                      (a/close! result-chan))
        futur       (.submit ^ThreadPoolExecutor @#'a/thread-macro-executor ^Runnable (bound-fn* thunk*))]
    ;; if `result-chan` gets a result/closed *before* `done-chan`, it means it was closed by the caller, so we should
    ;; cancel the thread running `thunk*`
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
  `(cancelable-thread-call (^:once fn* [] ~@body)))
