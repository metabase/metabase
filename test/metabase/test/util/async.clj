(ns metabase.test.util.async
  (:require
   [clojure.core.async :as a]
   [grouper.core :as grouper]
   [metabase.util :as u])
  (:import
   (grouper.core Grouper)))

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

(defn do-with-grouper-immediately-realizes!
  [f]
  (let [original-submit grouper/submit!
        submitted       (atom [])
        groupers        (atom #{})]
    (with-redefs [grouper/submit! (fn [& args]
                                    (swap! groupers conj (first args))
                                    (swap! submitted conj
                                           ;; this returns a promise we can wait for
                                           (apply original-submit args)))]
      (f (fn []
           (u/poll {:thunk (fn []
                             (doseq [grouper @groupers]
                               (.wakeUp ^Grouper grouper))
                             (every? realized? @submitted))
                    :done? true?
                    :interval 100
                    :timeout 1000}))))))

(defmacro with-grouper-realize!
  "Test helpers to test grouper operations.
  Records all [[grouper/submit!]] calls and provider a [[realize]] function that will force all of them to be realized.

    (with-grouper-realize! [realize]
      (grouper/submit! a-grouper some-data)
      ;; all submitted data will be forced to realize
      (realize)"
  [[realize-binding] & body]
  {:arglists     '([realize-binding])
   :style/indent 0}
  `(do-with-grouper-immediately-realizes! (^:once fn* [~realize-binding] ~@body)))
