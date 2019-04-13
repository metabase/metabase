(ns metabase.query-processor.async
  "Async versions of the usual public query processor functions. Instead of blocking while the query is ran, these
  functions all return a `core.async` channel that can be used to fetch the results when they become available.

  Each connected database is limited to a maximum of 15 simultaneous queries (configurable) using these methods; any
  additional queries will park the thread. Super-useful for writing high-performance API endpoints. Prefer these
  methods to the old-school synchronous versions.

  How is this achieved? For each Database, we'll maintain a channel that acts as a counting semaphore; the channel
  will initially contain 15 permits. Each incoming request will asynchronously read from the channel until it acquires
  a permit, then put it back when it finishes."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.async
             [semaphore-channel :as semaphore-channel]
             [util :as async.u]]
            [metabase.models.setting :refer [defsetting]]
            [metabase.query-processor
             [interface :as qpi]
             [util :as qputil]]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import clojure.core.async.impl.channels.ManyToManyChannel))

(defsetting max-simultaneous-queries-per-db
  (trs "Maximum number of simultaneous queries to allow per connected Database.")
  :type    :integer
  :default 15)


(defonce ^:private db-semaphore-channels (atom {}))

(defn- fetch-db-semaphore-channel
  "Fetch the counting semaphore channel for a Database, creating it if not already created."
  [database-or-id]
  (let [id (u/get-id database-or-id)]
    (or
     ;; channel already exists
     (@db-semaphore-channels id)
     ;; channel does not exist, Create a channel and stick it in the atom
     (let [ch     (semaphore-channel/semaphore-channel (max-simultaneous-queries-per-db))
           new-ch ((swap! db-semaphore-channels update id #(or % ch)) id)]
       ;; ok, if the value swapped into the atom was a different channel (another thread beat us to it) then close our
       ;; newly created channel
       (when-not (= ch new-ch)
         (a/close! ch))
       ;; return the newly created channel
       new-ch))))

(defn- do-async
  "Execute `f` asynchronously, waiting to receive a permit from `db`'s semaphore channel before proceeding. Returns the
  results in a channel."
  [db f & args]
  (let [semaphore-chan (fetch-db-semaphore-channel db)]
    (apply semaphore-channel/do-after-receiving-permit semaphore-chan f args)))

(defn process-query
  "Async version of `metabase.query-processor/process-query`. Runs query asynchronously, and returns a `core.async`
  channel that can be used to fetch the results once the query finishes running. Closing the channel will cancel the
  query."
  [query]
  (do-async (:database query) qp/process-query query))

(defn process-query-and-save-execution!
  "Async version of `metabase.query-processor/process-query-and-save-execution!`. Runs query asynchronously, and returns
  a `core.async` channel that can be used to fetch the results once the query finishes running. Closing the channel
  will cancel the query."
  [query options]
  (do-async (:database query) qp/process-query-and-save-execution! query options))

(defn process-query-and-save-with-max-results-constraints!
  "Async version of `metabase.query-processor/process-query-and-save-with-max-results-constraints!`. Runs query
  asynchronously, and returns a `core.async` channel that can be used to fetch the results once the query finishes
  running. Closing the channel will cancel the query."
  [query options]
  (do-async (:database query) qp/process-query-and-save-with-max-results-constraints! query options))


;;; ------------------------------------------------ Result Metadata -------------------------------------------------

(defn- transform-result-metadata-query-results [{:keys [status], :as results}]
  (when (= status :failed)
    (log/error (trs "Error running query to determine Card result metadata:")
               (u/pprint-to-str 'red results)))
  (or (get-in results [:data :results_metadata :columns])
      []))

(s/defn result-metadata-for-query-async :- ManyToManyChannel
  "Fetch the results metadata for a `query` by running the query and seeing what the QP gives us in return.
   This is obviously a bit wasteful so hopefully we can avoid having to do this. Returns a channel to get the
   results."
  [query]
  (let [out-chan (a/chan 1 (map transform-result-metadata-query-results))]
    ;; set up a pipe to get the async QP results and pipe them thru to out-chan
    (async.u/single-value-pipe
     (binding [qpi/*disable-qp-logging* true]
       (process-query
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
          (assoc-in query [:info :query-hash] (qputil/query-hash query)))
        ))
     out-chan)
    ;; return out-chan
    out-chan))
