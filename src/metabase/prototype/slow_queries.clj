(ns metabase.prototype.slow-queries
  "Query processor middleware that makes queries on the slow tables of the prototype dataset slow on purpose."
  (:require
   [clojure.string :as str]
   [metabase.prototype.dataset :as dataset]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.settings :as prototype.settings]))

(set! *warn-on-reflection* true)

(def ^:private slow-table-pattern
  ;; Matches `orders`, `"orders"` and `prototype_data.orders`, but not `orders_count`.
  (re-pattern (str "(?i)\\b(" (str/join "|" (sort dataset/slow-table-names)) ")\\b")))

(defn- compiled-sql [query]
  (let [compiled (get-in query [:qp/compiled :query])]
    (when (string? compiled) compiled)))

(defn- slow-query?
  "True for queries that a user runs on the prototype Database and that read a slow table. Sync and other
  internal queries have no `:executed-by`, so they stay fast."
  [query]
  (boolean
   (and (get-in query [:info :executed-by])
        (some-> (compiled-sql query) (->> (re-find slow-table-pattern)))
        (= (:database query) (prototype.db/prototype-database-id)))))

(defn delay-slow-queries
  "Wait [[prototype.settings/prototype-slow-query-delay-ms]] before a query on a slow prototype table runs.
  Cached results skip the wait, because this middleware runs inside the cache middleware."
  [qp]
  (fn [query rff]
    (when (slow-query? query)
      (Thread/sleep (long (prototype.settings/prototype-slow-query-delay-ms))))
    (qp query rff)))
