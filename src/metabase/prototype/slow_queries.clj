(ns metabase.prototype.slow-queries
  "Query processor middleware that makes queries on the slow tables of the prototype dataset slow on purpose."
  (:require
   [clojure.string :as str]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.samples :as samples]
   [metabase.prototype.settings :as prototype.settings]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private slow-table-pattern
  ;; Matches `orders`, `"orders"` and `prototype_data.orders`, but not `orders_count`.
  (re-pattern (str "(?i)\\b(" (str/join "|" (sort dataset/slow-table-names)) ")\\b")))

(defn- compiled-sql [query]
  (let [compiled (get-in query [:qp/compiled :query])]
    (when (string? compiled) compiled)))

(def ^:private delay-factors
  "How much longer than the base delay a query on each slow table waits, so that the tables have different
  runtimes."
  {"orders"          1.0
   "web_events"      2.0
   "support_tickets" 0.7
   "reviews"         0.5})

(defn delay-ms
  "The wait for a query on the slow `table-names`: the base delay, times the factor of the slowest table, times a
  random 0.9 to 1.5. `u` is a uniform random number from 0 to 1. Most waits are near the low end, and some are much
  longer, like real runtimes."
  ^long [table-names u]
  (let [factor (transduce (map #(get delay-factors % 0.0)) max 0.0 table-names)]
    (long (* (prototype.settings/prototype-slow-query-delay-ms) factor (+ 0.9 (* 0.6 u u u))))))

(defn- slow-table-names
  "The slow tables that a user query on the prototype Database reads, or nil. Sync and other internal queries have
  no `:executed-by`, so they stay fast."
  [query]
  (when (and (get-in query [:info :executed-by])
             (= (:database query) (prototype.db/prototype-database-id)))
    (some->> (compiled-sql query)
             (re-seq slow-table-pattern)
             (map (comp u/lower-case-en second))
             not-empty
             set)))

(defn- sample-query?
  "True for the queries that the frontend runs on the samples of the slow tables, for the filter widgets."
  [query]
  (boolean
   (and (get-in query [:middleware :prototype-sample?])
        (compiled-sql query)
        (= (:database query) (prototype.db/prototype-database-id)))))

(defn- use-samples
  "The query with the slow tables replaced by their samples. The SQL names each table with its schema, also in the
  column references, so a replacement of the schema and table name is enough."
  [query]
  (update-in query [:qp/compiled :query]
             (fn [sql]
               (reduce (fn [sql table-name]
                         (str/replace sql
                                      (format "\"%s\".\"%s\"" dataset/schema-name table-name)
                                      (format "\"%s\".\"%s\"" samples/schema-name table-name)))
                       sql
                       dataset/slow-table-names))))

(defn delay-slow-queries
  "Wait [[delay-ms]] before a query on a slow prototype table runs.
  Cached results skip the wait, because this middleware runs inside the cache middleware. A query for the samples
  runs on the samples at once."
  [qp]
  (fn [query rff]
    (cond
      (sample-query? query)
      (qp (use-samples query) rff)

      :else
      (do (when-let [table-names (slow-table-names query)]
            (Thread/sleep (delay-ms table-names (rand))))
          (qp query rff)))))
