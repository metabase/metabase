(ns metabase.async.util
  "Utility functions for core.async-based async logic."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import clojure.core.async.impl.buffers.PromiseBuffer
           clojure.core.async.impl.channels.ManyToManyChannel
           [java.util.concurrent Executor Future]))

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

(s/defn ^:deprecated ^:private do-on-separate-thread* :- Future
  [out-chan f & args]
  (future
    (try
      (log/debug (trs "Running {0} on separate thread..." f))
      (try
        (let [result (apply f args)]
          (cond
            (nil? result)
            (log/warn (trs "Warning: {0} returned `nil`" f))

            (not (a/>!! out-chan result))
            (log/error (trs "Unexpected error writing result to output channel: already closed"))))
        ;; if we catch an Exception (shouldn't happen in a QP query, but just in case), send it to `chan`.
        ;; It's ok, our IMPL of Ring `StreamableResponseBody` will do the right thing with it.
        (catch Throwable e
          (log/error e (trs "Caught error running {0}" f))
          (when-not (a/>!! out-chan e)
            (log/error e (trs "Unexpected error writing exception to output channel: already closed")))))
      (finally
        (a/close! out-chan)))))

(s/defn ^:deprecated do-on-separate-thread :- PromiseChan
  "Run `(apply f args)` on a separate thread, returns a channel to fetch the results. Closing this channel early will
  cancel the future running the function, if possible.

  This is basically like `core.async/thread-call` but returns a promise channel instead of a regular channel and
  cancels the execution of `f` if the channel closes early.

  DEPRECATED -- use `cancelable-thread-call` or `cancelable-thread` instead, which accomplishes the same thing in a
  simpler fashion with an interface more similar to existing `a/thread` and `a/thread-call`."
  [f & args]
  (let [out-chan (a/promise-chan)
        ;; Run `f` on a separarate thread because it's a potentially long-running QP query and we don't want to tie
        ;; up precious core.async threads
        futur    (apply do-on-separate-thread* out-chan f args)]
    ;; if output chan is closed early cancel the future
    (a/go
      (when (nil? (a/<! out-chan))
        (log/debug (trs "Request canceled, canceling future."))
        (future-cancel futur)))
    out-chan))

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
        futur       (.execute ^Executor (var-get (resolve 'clojure.core.async/thread-macro-executor)) f*)]
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
  [& body]
  `(cancelable-thread-call (fn [] ~@body)))
