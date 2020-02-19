(ns metabase.query-processor.context.default
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.query-processor
             [context :as context]
             [error-type :as error-type]]
            [metabase.util.i18n :refer [trs tru]]))

(def query-timeout-ms
  "Maximum amount of time to wait for a running query to complete before throwing an Exception."
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  (cond
    config/is-prod? (u/minutes->ms 20)
    config/is-test? (u/seconds->ms 30)
    config/is-dev?  (u/minutes->ms 3)))

(defn default-rff
  "Default function returning a reducing function. Results are returned in the 'standard' map format e.g.

    {:data {:cols [...], :rows [...]}, :row_count ...}"
  [metadata]
  (let [row-count (volatile! 0)
        rows      (volatile! [])]
    (fn default-rf
      ([]
       {:data metadata})

      ([result]
       {:pre [(map? result)]}
       (-> result
           (assoc :row_count @row-count
                  :status :completed)
           (assoc-in [:data :rows] @rows)))

      ([result row]
       (vswap! row-count inc)
       (vswap! rows conj row)
       result))))

;; TODO - not 100% this makes sense -- should rows always be merged into metadata?
(defn- default-reducedf [metadata reduced-result context]
  (context/resultf reduced-result context))

(defn- default-base-xformf [metadata]
  (fn [f]
    (f metadata)))

(defn default-reducef
  "Default implementation of `reducef`. When using a custom implementation of `reducef` it's easiest to call this
  function inside the custom impl instead of attempting to duplicate the logic. See
  `metabase.query-processor.reducible-test/write-rows-to-file-test` for an example of a custom implementation."
  [xformf context metadata reducible-rows]
  {:pre [(fn? xformf)]}
  (let [metadata  (context/metadataf metadata context)
        metadata* (volatile! nil)]
    (let [rf ((xformf metadata)
              (fn [metadata]
                (vreset! metadata* metadata)
                ((context/rff context) metadata)))]
      (assert (fn? rf))
      (when-let [reduced-rows (try
                                (transduce identity rf reducible-rows)
                                (catch Throwable e
                                  (context/raisef (ex-info (tru "Error reducing result rows")
                                                    {:type error-type/qp}
                                                    e)
                                                  context)
                                  nil))]
        (context/reducedf @metadata* reduced-rows context)))))

(defn- default-runf [query xformf context]
  (try
    (context/executef driver/*driver* query context (fn respond* [metadata reducible-rows]
                                                      (context/reducef xformf context metadata reducible-rows)))
    (catch Throwable e
      (context/raisef e context))))

(defn- default-raisef [e context]
  {:pre [(instance? Throwable e)]}
  (context/resultf e context))

(defn- default-resultf [result context]
  (if (nil? result)
    (do
      (log/error (ex-info (trs "Unexpected nil result") {}) (trs "Unexpected nil result"))
      (recur false context))
    (let [out-chan (context/out-chan context)]
      (a/>!! out-chan result)
      (a/close! out-chan))))

(defn- default-timeoutf
  [context]
  (let [timeout (context/timeout context)]
    (log/debug (trs "Query timed out after {0} ms, raising timeout exception." timeout))
    (context/raisef (ex-info (tru "Timed out after {0}." (u/format-milliseconds timeout))
                      {:status :timed-out
                       :type   error-type/timed-out})
                    context)))

(defn- default-cancelf [context]
  (log/debug (trs "Query canceled before finishing."))
  (let [canceled-chan (context/canceled-chan context)]
    (a/>!! canceled-chan :cancel)
    (a/close! canceled-chan)))

(defn- identity1
  "Util fn. Takes 2 args and returns the first arg as-is."
  [x _]
  x)

(defn default-context
  "Return a new context for executing queries using the default values. These can be overrided as needed."
  []
  {:timeout       query-timeout-ms
   :rff           default-rff
   :base-xformf   default-base-xformf
   :raisef        default-raisef
   :runf          default-runf
   :executef      driver/execute-reducible-query
   :reducef       default-reducef
   :reducedf      default-reducedf
   :metadataf     identity1
   :preprocessedf identity1
   :nativef       identity1
   :cancelf       default-cancelf
   :timeoutf      default-timeoutf
   :resultf       default-resultf
   :canceled-chan (a/promise-chan)
   :out-chan      (a/promise-chan)})
