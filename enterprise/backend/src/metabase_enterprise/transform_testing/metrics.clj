(ns metabase-enterprise.transform-testing.metrics
  "Best-effort instrumentation for transform testing. Labels never contain user identifiers or SQL."
  (:require
   [metabase-enterprise.transform-testing.errors :as errors]
   [metabase.analytics-interface.core :as analytics]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(def ^:dynamic *operation*
  "Authoring operation responsible for validation; direct runner calls default to run."
  :run)

(defn emit!
  "Call an analytics function without allowing telemetry failures to affect execution."
  [f & args]
  (try
    (apply f args)
    (catch Throwable e
      (log/warn e "Failed to record transform-test metric"))))

(defn validate!
  "Count typed validation refusals, preserving the original exception."
  [f]
  (try
    (f)
    (catch clojure.lang.ExceptionInfo e
      (when-let [error-type (:error-type (ex-data e))]
        (emit! analytics/inc! :metabase-transform-test/refusals
               {:operation *operation* :error-code (errors/code error-type)}))
      (throw e))))

(defn timed-phase!
  "Measure a phase even when it throws."
  [driver phase f]
  (let [timer (u/start-timer)]
    (try
      (f)
      (finally
        (emit! analytics/observe! :metabase-transform-test/phase-duration-ms
               {:driver driver :phase phase} (u/since-ms timer))))))
