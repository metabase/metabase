(ns metabase.driver.crate.query-processor
  (:require [clojure.java.jdbc :as jdbc]
            [honeysql.helpers :as h]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as qp]
            [metabase.query-processor.interface :as i])
  (:import (metabase.query_processor.interface ComparisonFilter CompoundFilter)))

(defn- rewrite-between
  "Rewrite [:between <field> <min> <max>] -> [:and [:>= <field> <min>] [:<= <field> <max>]]"
  [clause]
  (i/strict-map->CompoundFilter {:compound-type :and
                                 :subclauses    [(i/strict-map->ComparisonFilter {:filter-type :>=
                                                                                  :field       (:field clause)
                                                                                  :value       (:min-val clause)})
                                                 (i/strict-map->ComparisonFilter {:filter-type :<=
                                                                                  :field       (:field clause)
                                                                                  :value       (:max-val clause)})]}))

(defn- filter-clause->predicate
  "resolve filters recursively"
  [{:keys [compound-type filter-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply vector :and (map filter-clause->predicate subclauses))
    :or  (apply vector :or  (map filter-clause->predicate subclauses))
    :not [:not (filter-clause->predicate subclause)]
    nil  (qp/filter-clause->predicate (if (= filter-type :between)
                                        (rewrite-between clause)
                                        clause))))

(defn apply-filter
  "Apply custom generic SQL filter. This is the place to perform query rewrites."
  [_ honeysql-form {clause :filter}]
  (h/where honeysql-form (filter-clause->predicate clause)))

(defn execute-query
  "Execute a query against Crate database.

   We specifically write out own `execute-query` function to avoid the autoCommit(false) call."
  [_ {:keys [database], {sql :query, params :params} :native}]
  (try (let [db-conn (sql/db->jdbc-connection-spec database)]
         (jdbc/with-db-connection [t-conn db-conn]
           (let [statement (if params
                             (into [sql] params)
                             sql)]
             (let [[columns & rows] (jdbc/query t-conn statement, :identifiers identity, :as-arrays? true)]
               {:rows    rows
                :columns columns}))))
       (catch java.sql.SQLException e
         (let [^String message (or (->> (.getMessage e)     ; error message comes back like 'Column "ZID" not found; SQL statement: ... [error-code]' sometimes
                                        (re-find #"^(.*);") ; the user already knows the SQL, and error code is meaningless
                                        second)             ; so just return the part of the exception that is relevant
                                   (.getMessage e))]
           (throw (Exception. message))))))
