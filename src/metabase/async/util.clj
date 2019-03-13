(ns metabase.async.util
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))

(s/defn single-value-pipe :- ManyToManyChannel
  "Pipe that will forward a single message from `in-chan` to `out-chan`, closing both afterward. If `out-chan` is closed
  before `in-chan` produces a value, closes `in-chan`; this can be used to automatically cancel QP requests and the
  like.

  Returns a channel that will send a single message when such early-closing cancelation occurs. You can listen for
  this message to implement special cancelation behavior, such as canceling async jobs. This channel automatically
  closes when either `in-chan` or `out-chan` closes."
  [in-chan :- ManyToManyChannel, out-chan :- ManyToManyChannel]
  (let [canceled-chan (a/chan 1)]
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

(defn do-on-separate-thread
  "Run `(apply f args)` on a separate thread, returns a channel to fetch the results. Closing this channel early will
  cancel the future running the function, if possible."
  [f & args]
  (let [in-chan       (a/chan 1)
        out-chan      (a/chan 1)
        canceled-chan (single-value-pipe in-chan out-chan)
        ;; Run `f` on a separarate thread because it's a potentially long-running QP query and we don't want to tie
        ;; up precious core.async threads
        futur
        (future
          (if-not (= ::open (first (a/alts!! [out-chan] :default ::open)))
            (log/debug (trs "Output channel closed, will skip running {0}." f))
            (do
              (log/debug (trs "Running {0} on separate thread..." f))
              (try
                (let [result (apply f args)]
                  (a/put! in-chan result))
                ;; if we catch an Exception (shouldn't happen in a QP query, but just in case), send it to `chan`. It's ok,
                ;; our IMPL of Ring `StreamableResponseBody` will do the right thing with it.
                (catch Throwable e
                  (log/error e (trs "Caught error running {0}" f))
                  (a/put! in-chan e))))))]
    (a/go
      (when-let [canceled (a/<! canceled-chan)]
        (log/debug (trs "Request canceled, canceling future"))
        (future-cancel futur)))

    out-chan))
