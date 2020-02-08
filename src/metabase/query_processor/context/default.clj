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
  (let [row-count (volatile! 0)]
    (fn default-rf
      ([]
       {:data (assoc metadata :rows [])})

      ([result]
       {:pre [(map? result)]}
       (assoc result
              :row_count @row-count
              :status :completed))

      ([result row]
       (vswap! row-count inc)
       (update-in result [:data :rows] conj row)))))

(defn default-reducedf [metadata reduced-result context]
  #_(assoc-in metadata [:data :rows] reduced-rows)
  (context/resultf reduced-result context))

(defn default-reducef [xformf context metadata reducible-rows]
  {:pre [(fn? xformf)]}
  (let [metadata (context/metadataf metadata context)
        xform    (xformf metadata)
        rff      (context/rff context)
        rf       (rff metadata)
        rf       (xform rf)]
    (context/reducedf metadata (transduce identity rf reducible-rows) context)))

(defn default-runf [query xformf context]
  (context/executef driver/*driver* query context (fn respond* [metadata reducible-rows]
                                                    (context/reducef xformf context metadata reducible-rows))))

(defn default-raisef [e context]
  {:pre [(instance? Throwable e)]}
  (context/resultf e context))

(defn default-resultf [result context]
  (a/>!! (context/out-chan context) result))

(defn default-timeoutf [context]
  (let [timeout (context/timeout context)]
    (log/debug (trs "Query timed out after {0} ms, raising timeout exception." timeout))
    (context/raisef (ex-info (tru "Timed out after {0}." (u/format-milliseconds timeout))
                      {:status :timed-out
                       :type   error-type/timed-out})
                    context)))

(defn default-cancelf [context]
  (log/debug (trs "Query canceled before finishing."))
  (a/>!! (context/canceled-chan context) :cancel))

(defn identity1
  "Util fn. Takes 2 args and returns the first arg as-is."
  [x _]
  x)

(defn default-context []
  {:timeout        query-timeout-ms
   :rff            default-rff
   :default-xformf (constantly identity)
   :raisef         default-raisef
   :runf           default-runf
   :executef       driver/execute-reducible-query
   :reducef        default-reducef
   :reducedf       default-reducedf
   :metadataf      identity1
   :preprocessedf  identity1
   :nativef        identity1
   :cancelf        default-cancelf
   :resultf        default-resultf
   :canceled-chan  (a/promise-chan)
   :out-chan       (a/promise-chan)})
