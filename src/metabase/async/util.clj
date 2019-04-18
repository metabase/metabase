(ns metabase.async.util
  "Utility functions for core.async-based async logic."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import clojure.core.async.impl.buffers.PromiseBuffer
           clojure.core.async.impl.channels.ManyToManyChannel
           java.util.concurrent.Future))

(defn promise-chan?
  "Is core.async `chan` a `promise-chan`?"
  [chan]
  (and (instance? ManyToManyChannel chan)
       (instance? PromiseBuffer (.buf ^ManyToManyChannel chan))))

(def PromiseChan
  "Schema for a core.async promise channel."
  (s/constrained ManyToManyChannel promise-chan? "promise chan"))

(s/defn promise-canceled-chan :- PromiseChan
  "Given a `promise-chan`, return a new channel that will receive a single message if `promise-chan` is closed before
  a message is written to it (i.e. if an API request is canceled). Automatically closes after `promise-chan` receives
  a message or is closed."
  [promise-chan :- PromiseChan]
  (let [canceled-chan (a/promise-chan)]
    (a/go
      (when (nil? (a/<! promise-chan))
        (a/>! canceled-chan ::canceled))
      (a/close! canceled-chan))
    canceled-chan))

(s/defn single-value-pipe :- PromiseChan
  "Pipe that will forward a single message from `in-chan` to `out-chan`, closing both afterward. If `out-chan` is closed
  before `in-chan` produces a value, closes `in-chan`; this can be used to automatically cancel QP requests and the
  like.

  Returns a channel that will send a single message when such early-closing cancelation occurs. You can listen for
  this message to implement special cancelation/close behavior, such as canceling async jobs. This channel
  automatically closes when either `in-chan` or `out-chan` closes."
  [in-chan :- ManyToManyChannel, out-chan :- ManyToManyChannel]
  (let [canceled-chan (a/promise-chan)]
    ;; fire off a block that will wait for either in-chan to produce a result or out-chan to be closed
    (a/go
      (try
        (let [[result first-finished-chan] (a/alts! [in-chan out-chan])]
          (if (and (= first-finished-chan in-chan)
                   (some? result))
            ;; If `in-chan` (e.g. fn call result) finishes first and receives a result, forward result to `out-chan`
            (a/>! out-chan result)
            ;; Otherwise one of the two channels was closed (e.g. query cancelation) before `in-chan` returned a
            ;; result (e.g. QP result), pass a message to `canceled-chan`; `finally` block will close all three channels
            (a/>! canceled-chan ::canceled)))
        ;; Either way, close whichever of the channels is still open just to be safe
        (finally
          (a/close! out-chan)
          (a/close! in-chan)
          (a/close! canceled-chan))))
    ;; return the canceled chan in case someone wants to listen to it
    canceled-chan))

(s/defn ^:private do-on-separate-thread* :- Future
  [out-chan canceled-chan f & args]
  (future
    (try
      (if (a/poll! canceled-chan)
        (log/debug (trs "Output channel closed, will skip running {0}." f))
        (do
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
                (log/error (trs "Unexpected error writing exception to output channel: already closed")))))))
      (finally
        (a/close! out-chan)))))

(s/defn do-on-separate-thread :- PromiseChan
  "Run `(apply f args)` on a separate thread, returns a channel to fetch the results. Closing this channel early will
  cancel the future running the function, if possible."
  [f & args]
  (let [out-chan      (a/promise-chan)
        canceled-chan (promise-canceled-chan out-chan)
        ;; Run `f` on a separarate thread because it's a potentially long-running QP query and we don't want to tie
        ;; up precious core.async threads
        futur         (apply do-on-separate-thread* out-chan canceled-chan f args)]
    ;; if output chan is closed early cancel the future
    (a/go
      (when (a/<! canceled-chan)
        (log/debug (trs "Request canceled, canceling future."))
        (future-cancel futur)))
    out-chan))
