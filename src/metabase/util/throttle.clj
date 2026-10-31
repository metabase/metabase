(ns metabase.util.throttle
  "Helpers for counting failed attempts against a throttler and turning throttle exceptions into HTTP 429 responses."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [throttle.core :as throttle])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn throttle-exception?
  "True when `e` is a throttle-limit exception thrown by `throttle.core`."
  [^ExceptionInfo e]
  (str/starts-with? (str (ex-message e)) "Too many attempts!"))

(defn do-with-failure-throttling
  "Like `throttle.core/do-with-throttling`, but counts each attempt from when it starts until `f` returns, so attempts
  that run at the same time all count; a failed attempt stays counted until it expires, an attempt refused here or by
  a throttle inside `f` is not counted, and the throttle exception is thrown when the key is at its threshold."
  [{:keys [attempts attempts-threshold attempt-ttl-ms] :as throttler} throttle-key f]
  (let [now-ms   (System/currentTimeMillis)
        attempt  [throttle-key now-ms]
        live?    (fn [[_ attempt-ms]] (> attempt-ms (- now-ms attempt-ttl-ms)))
        forget!  (fn []
                   (swap! attempts (fn [current]
                                     (let [[newer [_ & older]] (split-with #(not (identical? % attempt)) current)]
                                       (reduce conj older (reverse newer))))))
        recorded (swap! attempts conj attempt)
        before   (filter live? (rest recorded))]
    (when (< (second (last recorded)) (- now-ms (* 1.1 attempt-ttl-ms)))
      (swap! attempts #(doall (take-while live? %))))
    (when (>= (count (filter (fn [[k]] (= k throttle-key)) before)) attempts-threshold)
      (forget!)
      (throw (#'throttle/make-throttling-ex (assoc throttler :attempts (atom before)) throttle-key)))
    (u/prog1 (try
               (f)
               (catch ExceptionInfo e
                 (when (throttle-exception? e)
                   (forget!))
                 (throw e)))
      (forget!))))

(defn throttle-response
  "Build a 429 Ring response from a throttle exception, extracting Retry-After when available.
   `body` is the response `:body` (callers build whatever shape their endpoint wants)."
  [^ExceptionInfo e body]
  (let [retry-seconds (some->> (ex-message e) (re-find #"(\d+) seconds") second)]
    (cond-> {:status  429
             :headers {"Content-Type" "application/json"}
             :body    body}
      retry-seconds (assoc-in [:headers "Retry-After"] retry-seconds))))
