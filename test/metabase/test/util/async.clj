(ns ^{:added "0.50.0"} metabase.test.util.async
  (:require
   [clojure.core.async :as a]))

(set! *warn-on-reflection* true)

(defmacro with-open-channels
  "Like [[with-open]], but closes core.async channels at the conclusion of `body`."
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

(defn wait-for-result
  "Wait up to `timeout-ms` (default 200) for a result from `chan`, or return a `::timed-out` message. Closes the channel
  when finished. Be careful when using this with non-promise channels, since it will consume the results!"
  ([chan]
   (wait-for-result chan 200))
  ([chan timeout-ms]
   (wait-for-result chan timeout-ms ::timed-out))
  ([chan timeout-ms timed-out-val]
   (try
     (let [[val port] (a/alts!! [chan (a/timeout timeout-ms)] :priority true)]
       (if (not= port chan)
         timed-out-val
         val))
     (finally
       (a/close! chan)))))
