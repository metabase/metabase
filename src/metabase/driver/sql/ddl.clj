(ns metabase.driver.sql.ddl
  (:require [clojure.java.jdbc :as jdbc]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql.util :as sql.u]
            [metabase.public-settings :as public-settings]))

(defn- quote-fn [driver]
  (fn quote [ident entity]
    (sql.u/quote-name driver ident (ddl.i/format-name driver entity))))

(defn- add-remark [sql-str]
  (str "-- Metabase\n"
       sql-str))

(defn execute!
  "Executes sql and params with a standard remark prepended to the statement."
  [conn [sql & params]]
  (jdbc/execute! conn (into [(add-remark sql)] params)))

(defn jdbc-query
  "Queries sql and params with a standard remark prepended to the statement."
  [conn [sql & params]]
  (jdbc/query conn (into [(add-remark sql)] params)))

(defn create-schema-sql
  "SQL string to create a schema suitable"
  [{driver :engine :as database}]
  (let [q (quote-fn driver)]
    (format "create schema %s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid))))))

(defn drop-schema-sql
  "SQL string to drop a schema suitable"
  [{driver :engine :as database}]
  (let [q (quote-fn driver)]
    (format "drop schema if exists %s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid))))))

(defn create-table-sql
  "Formats a create table statement within our own cache schema"
  [{driver :engine :as database} definition query]
  (let [q (quote-fn driver)]
    (format "create table %s.%s as %s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
            (q :table (:table-name definition))
            query)))

(defn drop-table-sql
  "Formats a drop table statement within our own cache schema"
  [{driver :engine :as database} table-name]
  (let [q (quote-fn driver)]
    (format "drop table if exists %s.%s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
            (q :table table-name))))
