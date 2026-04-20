(ns metabase.util.throttle
  "Helpers for turning throttle exceptions into HTTP 429 responses."
  (:require
   [clojure.string :as str])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn throttle-exception?
  "True when `e` is a throttle-limit exception thrown by `throttle.core`."
  [^ExceptionInfo e]
  (str/starts-with? (ex-message e) "Too many attempts!"))

(defn throttle-response
  "Build a 429 Ring response from a throttle exception, extracting Retry-After when available.
   `body` is the response `:body` (callers build whatever shape their endpoint wants)."
  [^ExceptionInfo e body]
  (let [retry-seconds (some->> (ex-message e) (re-find #"(\d+) seconds") second)]
    (cond-> {:status  429
             :headers {"Content-Type" "application/json"}
             :body    body}
      retry-seconds (assoc-in [:headers "Retry-After"] retry-seconds))))
