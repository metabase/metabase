(ns metabase.query-processor.async
  "Mostly legacy namespace that these days is reduced to a single util function, `result-metadata-for-query-async`. TODO
  -- Consider whether there's a place to put this to consolidate things."
  (:require [clojure.tools.logging :as log]
            [metabase.api.common :as api]
            [metabase.query-processor :as qp]
            [metabase.query-processor
             [context :as context]
             [interface :as qpi]
             [util :as qputil]]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))

(defn- query-for-result-metadata [query]
  ;; for purposes of calculating the actual Fields & types returned by this query we really only need the first
  ;; row in the results
  (let [query (-> query
                  (assoc-in [:constraints :max-results] 1)
                  (assoc-in [:constraints :max-results-bare-rows] 1)
                  (assoc-in [:info :executed-by] api/*current-user-id*))]
    ;; need add the constraints above before calculating hash because those affect the hash
    ;;
    ;; (normally middleware takes care of calculating query hashes for 'userland' queries but this is not
    ;; technically a userland query -- we don't want to save a QueryExecution -- so we need to add `executed-by`
    ;; and `query-hash` ourselves so the remark gets added)
    (assoc-in query [:info :query-hash] (qputil/query-hash query))))

(defn- async-result-metadata-reducedf [_ result context]
  (let [results-metdata (or (get-in result [:data :results_metadata :columns])
                            [])]
    (context/resultf results-metdata context)))

(defn- async-result-metdata-raisef [e context]
  (log/error e (trs "Error running query to determine Card result metadata:"))
  (context/resultf [] context))

(s/defn result-metadata-for-query-async :- ManyToManyChannel
  "Fetch the results metadata for a `query` by running the query and seeing what the QP gives us in return.
   This is obviously a bit wasteful so hopefully we can avoid having to do this. Returns a channel to get the
   results."
  [query]
  (binding [qpi/*disable-qp-logging* true]
    (let [query (query-for-result-metadata query)]
      (qp/process-query-async query {:reducedf async-result-metadata-reducedf
                                     :raisef   async-result-metdata-raisef}))))
