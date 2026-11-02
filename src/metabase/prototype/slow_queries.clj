(ns metabase.prototype.slow-queries
  "Query processor middleware that makes queries slow on purpose. Each browser chooses fast or slow data in the
  prototype settings, and sends its choice in the [[data-speed-header]] of each request. With slow data, each user
  query waits before it runs."
  (:require
   [clojure.string :as str]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.samples :as samples]
   [metabase.prototype.settings :as prototype.settings]
   [metabase.request.core :as request]))

(set! *warn-on-reflection* true)

(def ^:private data-speed-header
  "The frontend sends \"slow\" or \"fast\". Ring gives header names in lower case."
  "x-metabase-prototype-data-speed")

(defn slow-data?
  "True when the browser that sent the current request asks for slow data."
  []
  (= "slow" (get-in (request/current-request) [:headers data-speed-header])))

(defn- compiled-sql [query]
  (let [compiled (get-in query [:qp/compiled :query])]
    (when (string? compiled) compiled)))

(defn delay-ms
  "The wait for a query on slow data: the base delay, times a random 0.9 to 1.5. `u` is a uniform random number from
  0 to 1. Most waits are near the low end, and some are much longer, like real runtimes."
  ^long [u]
  (long (* (prototype.settings/prototype-slow-query-delay-ms) (+ 0.9 (* 0.6 u u u)))))

(defn- user-query?
  "Sync and other internal queries have no `:executed-by`, so they stay fast."
  [query]
  (boolean (get-in query [:info :executed-by])))

(defn- sample-query?
  "True for the queries that the frontend runs on the samples, for the filter widgets."
  [query]
  (boolean
   (and (get-in query [:middleware :prototype-sample?])
        (compiled-sql query)
        (= (:database query) (prototype.db/prototype-database-id)))))

(defn- use-samples
  "The query with the tables replaced by their samples. The SQL names each table with its schema, also in the column
  references, so a replacement of the schema and table name is enough."
  [query]
  (update-in query [:qp/compiled :query]
             (fn [sql]
               (reduce (fn [sql table-name]
                         (str/replace sql
                                      (format "\"%s\".\"%s\"" dataset/schema-name table-name)
                                      (format "\"%s\".\"%s\"" samples/schema-name table-name)))
                       sql
                       dataset/table-names))))

(defn delay-slow-queries
  "With slow data, wait [[delay-ms]] before a user query runs.
  Cached results skip the wait, because this middleware runs inside the cache middleware. A query for the samples
  runs on the samples at once."
  [qp]
  (fn [query rff]
    (cond
      (sample-query? query)
      (qp (use-samples query) rff)

      :else
      (do (when (and (user-query? query) (slow-data?))
            (Thread/sleep (delay-ms (rand))))
          (qp query rff)))))
