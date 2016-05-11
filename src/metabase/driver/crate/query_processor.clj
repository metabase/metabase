(ns metabase.driver.crate.query-processor
  (:require [clojure.java.jdbc :as jdbc]
            [korma.core :as k]
            [korma.sql.engine :as kengine]
            [korma.sql.fns :as kfns]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as qp]
            [metabase.query-processor.interface :as i])
  (:import (metabase.query_processor.interface ComparisonFilter CompoundFilter)))

(defn- rewrite-between
  "Rewrite [:between <field> <min> <max>] -> [:and [:>= <field> <min>] [:<= <field> <max>]]"
  [clause]
  (i/strict-map->CompoundFilter {:compound-type :and :subclauses [(ComparisonFilter. :>= (:field clause) (:min-val clause))
                                       (ComparisonFilter. :<= (:field clause) (:max-val clause))]}))

(defn resolve-subclauses
  "resolve filters recursively"
  [clause]
  (if (= (count (:subclauses clause)) 0)
    (case (:filter-type clause)
           :between (qp/filter-clause->predicate (rewrite-between clause))
           (qp/filter-clause->predicate clause))
    (case (:compound-type clause)
      :and (apply kfns/pred-and (map resolve-subclauses (:subclauses clause)))
      :or (apply kfns/pred-or  (map resolve-subclauses (:subclauses clause)))
      :not (kfns/pred-not (kengine/pred-map (qp/filter-subclause->predicate clause))))))

(defn apply-filter
  "Apply custom generic SQL filter. This is the place to perform query rewrites."
  [_ korma-form {clause :filter}]
  (k/where korma-form (resolve-subclauses clause)))

(defn execute-query
  "Execute a query against Crate database.

   We specifically write out own `execute-query` function to avoid the autoCommit(false) call."
  [_ {:keys [database], {sql :query, params :params} :native}]
  (try (let [db-conn (sql/db->jdbc-connection-spec database)]
         (jdbc/with-db-transaction [t-conn db-conn]
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
