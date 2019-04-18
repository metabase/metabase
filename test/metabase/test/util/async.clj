(ns metabase.test.util.async
  (:require [clojure.core.async :as a])
  (:import java.io.Closeable
           java.util.concurrent.TimeoutException))

(defn wait-for-close
  "Wait up to `timeout-ms` for `chan` to be closed, and returns `true` once it is; otherwise throws an Exception if
  channel is not closed by the timeout or unexpectedly returns a result."
  [chan timeout-ms]
  (let [[result first-to-finish] (a/alts!! [chan (a/timeout timeout-ms)])]
    (cond
      (and (= result nil)
           (= first-to-finish chan))
      true

      (= result nil)
      (throw (TimeoutException. "Timed out."))

      :else
      (do
        (println "Waiting for channel to close, but got unexpected result:" result)
        (throw (ex-info "Waiting for channel to close, but got unexpected result"
                 {:result result}))))))

(defmacro with-open-channels
  "Like `with-open`, but closes core.async channels at the conclusion of `body`."
  [[binding chan & more] & body]
  {:pre [binding chan]}
  `(let [chan# ~chan
         ~binding chan#]
     (try
       ~(if (seq more)
          `(with-open-channels ~more ~@body)
          `(do ~@body))
       (finally
         (a/close! chan#)))))


(defmacro with-chans
  "Create core.async channels and bind them; execute body, closing out the channels in a `finally` block. Useful for
  writing tests where you don't want to accidentally leave things open if something goes wrong.

    ;; Specifying definition is optional; defaults to `(a/chan 1)`
    (with-chans [my-chan]

    ;; specify multiple chans
    (with-chans [chan-1 (a/chan 1)
                 chan-2 (a/chan 100)]
      ...) "
  [[chan-binding chan & more] & body]
  `(with-open-channels [~chan-binding ~(or chan `(a/chan 1))]
     ~(if (seq more)
        `(with-chans ~more ~@body)
        `(do ~@body))))

(defn wait-for-result
  "Wait up to `timeout-ms` (default 200) for a result from `chan`, or return a `::timed-out` message."
  ([chan]
   (wait-for-result chan 200))
  ([chan timeout-ms]
   (try
     (let [[val port] (a/alts!! [chan (a/timeout timeout-ms)])]
       (if (not= port chan)
         ::timed-out
         val))
     (finally
       (a/close! chan)))))

(defprotocol NotifyClosed
  (on-close-chan [this]
    "Returns a channel that will get a `::closed` message when `.close` is called on the object."))

(defn permit
  "Return a mocked permit object to pass to a mocked semaphore channel. You can check whether this was closed correctly
  using `on-close-chan` above, or with `permit-closed?` below."
  []
  (let [closed-chan (a/promise-chan)]
    (reify
      Closeable
      (close [_]
        (a/>!! closed-chan ::closed)
        (a/close! closed-chan))
      NotifyClosed
      (on-close-chan [_]
        closed-chan))))

(defn permit-closed?
  "Wait up to 200 ms for mocked semaphore channel permit to be closed; returns true if closed or false otherwise."
  [mocked-permit]
  (= (wait-for-result (on-close-chan mocked-permit))
     ::closed))
