(ns metabase.driver.ddl.postgres
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.driver.ddl.interface :as ddl.i]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.util :as sql.u]
            [metabase.models.persisted-info :refer [PersistedInfo]]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor :as qp]
            [toucan.db :as db]))

(defn field-metadata->field-defintion
  [{:keys [name base_type effective_type]}]
  {:field-name name
   :base-type  (or effective_type base_type)})

(defn metadata->definition [metadata table-name]
  {:table-name        table-name
   :field-definitions (mapv field-metadata->field-defintion metadata)})

(defn quote-fn [driver]
  (fn quote [ident entity]
    (sql.u/quote-name driver ident (ddl.i/format-name driver entity))))

(defn create-schema-sql [{driver :engine :as database}]
  (let [q (quote-fn driver)]
    (format "create schema %s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid))))))

(defn create-table-sql [{driver :engine :as database} definition]
  (let [q (quote-fn driver)]
    (format "create table %s.%s (%s);"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
            (q :table (:table-name definition))
            (str/join
             ", "
             (for [{:keys [field-name base-type]} (:field-definitions definition)]
               (format "%s %s"
                       (q :field field-name)
                       (ddl.i/field-base-type->sql-type driver base-type)))))))

(defn drop-table-sql [{driver :engine :as database} table-name]
  (let [q (quote-fn driver)]
    (format "drop table %s.%s"
            (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
            (q :table table-name))))

(defn populate-table-sql [{driver :engine :as database} definition query]
  (let [q (quote-fn driver)]
   (format "insert into %s.%s (%s) %s"
           (q :table (ddl.i/schema-name database (public-settings/site-uuid)))
           (q :table (:table-name definition))
           (str/join
            ", "
            (for [{:keys [field-name]} (:field-definitions definition)]
              (q :field field-name)))
           query)))

(defmethod ddl.i/persist! :postgres
  [_driver database persisted-info card]
  (let [conn       (sql-jdbc.conn/db->pooled-connection-spec database)
        metadata   (:result_metadata card)
        definition (metadata->definition metadata (:table_name persisted-info))]
    (try
      (log/warn "creating table")
      (jdbc/execute! conn [(create-table-sql database definition)])
      (log/warn "populating table")
      (jdbc/execute! conn [(populate-table-sql database
                                               definition
                                               (-> (:dataset_query card)
                                                   qp/compile
                                                   :query))])
      (log/warn "marking persisted")
      (db/update! PersistedInfo (:id persisted-info) :active true, :state "persisted")
      (catch Exception e
        (log/warn e)
        (throw e)))))

(comment
  )

(defmethod ddl.i/unpersist! :postgres
  [_driver database persisted-info]
  (with-open [conn (sql-jdbc.conn/db->pooled-connection-spec database)]
    (try
      (jdbc/execute! conn [(drop-table-sql database (:table_name persisted-info))])
      (db/delete! PersistedInfo :id (:id persisted-info))
      (catch Exception e
        (log/warn e)
        (throw e)))))
