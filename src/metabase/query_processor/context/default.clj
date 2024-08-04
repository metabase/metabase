(ns metabase.query-processor.context.default
  (:require
   [clojure.core.async :as a]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]))

(def query-timeout-ms
  "Maximum amount of time to wait for a running query to complete before throwing an Exception."
  (u/minutes->ms (driver.u/db-query-timeout-minutes)))

(defn- default-reducedf [reduced-result context]
  (qp.context/resultf reduced-result context))

(defn default-reducef
  "Default implementation of `reducef`. When using a custom implementation of `reducef` it's easiest to call this
  function inside the custom impl instead of attempting to duplicate the logic. See
  [[metabase.query-processor.reducible-test/write-rows-to-file-test]] for an example of a custom implementation."
  [rff context metadata reducible-rows]
  {:pre [(fn? rff)]}
  (let [rf (rff metadata)]
    (assert (fn? rf))
    (when-let [reduced-rows (try
                              (transduce identity rf reducible-rows)
                              (catch Throwable e
                                (qp.context/raisef (ex-info (tru "Error reducing result rows: {0}" (ex-message e))
                                                            {:type qp.error-type/qp}
                                                            e)
                                                   context)))]
      (qp.context/reducedf reduced-rows context))))

(defn- default-runf [query rff context]
  (try
    (qp.context/executef driver/*driver* query context (fn respond* [metadata reducible-rows]
                                                         (qp.context/reducef rff context metadata reducible-rows)))
    (catch Throwable e
      (qp.context/raisef e context))))

(defn- default-raisef [e context]
  {:pre [(instance? Throwable e)]}
  (qp.context/resultf e context))

(defn- default-resultf [result context]
  (if (nil? result)
    (do
      (log/error (ex-info (trs "Unexpected nil result") {}))
      (recur false context))
    (let [out-chan (qp.context/out-chan context)]
      (a/>!! out-chan result)
      (a/close! out-chan))))

(defn- default-timeoutf
  [context]
  (let [timeout (qp.context/timeout context)]
    (log/debug (trs "Query timed out after {0}, raising timeout exception." (u/format-milliseconds timeout)))
    (qp.context/raisef (ex-info (tru "Timed out after {0}." (u/format-milliseconds timeout))
                                {:status :timed-out
                                 :type   qp.error-type/timed-out})
                       context)))

(defn default-context
  "Return a new context for executing queries using the default values. These can be overrided as needed."
  []
  {::complete?    true
   :timeout       query-timeout-ms
   :raisef        default-raisef
   :runf          default-runf
   :executef      driver/execute-reducible-query
   :reducef       default-reducef
   :reducedf      default-reducedf
   :timeoutf      default-timeoutf
   :resultf       default-resultf
   :canceled-chan (a/promise-chan)
   :out-chan      (a/promise-chan)})
