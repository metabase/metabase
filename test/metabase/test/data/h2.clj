(ns metabase.test.data.h2
  "Code for creating / destroying an H2 database from a `DatabaseDefinition`."
  (:require [clojure.string :as s]
            [metabase.db.spec :as dbspec]
            metabase.driver.h2 ; because we import metabase.driver.h2.H2Driver below
            [metabase.test.data
             [generic-sql :as generic]
             [interface :as i]]
            [metabase.util :as u])
  (:import metabase.driver.h2.H2Driver))

(def ^:private ^:const field-base-type->sql-type
  {:type/BigInteger "BIGINT"
   :type/Boolean    "BOOL"
   :type/Date       "DATE"
   :type/DateTime   "DATETIME"
   :type/Decimal    "DECIMAL"
   :type/Float      "FLOAT"
   :type/Integer    "INTEGER"
   :type/Text       "VARCHAR"
   :type/Time       "TIME"})


(defn- database->connection-details [context dbdef]
  {:db (str "mem:" (i/escaped-name dbdef) (when (= context :db)
                                            ;; Return details with the GUEST user added so SQL queries are allowed.
                                            ";USER=GUEST;PASSWORD=guest"))})


(defn- quote-name [nm]
  (str \" (s/upper-case nm) \"))

(def ^:private ^:const ^String create-db-sql
  (str
   ;; We don't need to actually do anything to create a database here. Just disable the undo
   ;; log (i.e., transactions) for this DB session because the bulk operations to load data don't need to be atomic
   "SET UNDO_LOG = 0;\n"

   ;; Create a non-admin account 'GUEST' which will be used from here on out
   "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';\n"

   ;; Set DB_CLOSE_DELAY here because only admins are allowed to do it, so we can't set it via the connection string.
   ;; Set it to to -1 (no automatic closing)
   "SET DB_CLOSE_DELAY -1;"))

(defn- create-table-sql [this dbdef {:keys [table-name], :as tabledef}]
  (str
   (generic/default-create-table-sql this dbdef tabledef) ";\n"

   ;; Grant the GUEST account r/w permissions for this table
   (format "GRANT ALL ON %s TO GUEST;" (quote-name table-name))))


(u/strict-extend H2Driver
  generic/IGenericSQLTestExtensions
  (let [{:keys [execute-sql!], :as mixin} generic/DefaultsMixin]
    (merge mixin
           {:create-db-sql             (constantly create-db-sql)
            :create-table-sql          create-table-sql
            ;; Don't use the h2 driver implementation, which makes the connection string read-only & if-exists only
            :database->spec            (comp dbspec/h2 i/database->connection-details)
            :drop-db-if-exists-sql     (constantly nil)
            :execute-sql!              (fn [this _ dbdef sql]
                                         ;; we always want to use 'server' context when execute-sql! is called (never
                                         ;; try connect as GUEST, since we're not giving them priviledges to create
                                         ;; tables / etc)
                                         (execute-sql! this :server dbdef sql))
            :field-base-type->sql-type (u/drop-first-arg field-base-type->sql-type)
            :load-data!                generic/load-data-all-at-once!
            :pk-field-name             (constantly "ID")
            :pk-sql-type               (constantly "BIGINT AUTO_INCREMENT")
            :prepare-identifier        (u/drop-first-arg s/upper-case)
            :quote-name                (u/drop-first-arg quote-name)}))

  i/IDriverTestExtensions
  (merge generic/IDriverTestExtensionsMixin
         {:database->connection-details       (u/drop-first-arg database->connection-details)
          :default-schema                     (constantly "PUBLIC")
          :engine                             (constantly :h2)
          :format-name                        (u/drop-first-arg s/upper-case)
          :has-questionable-timezone-support? (constantly true)
          :id-field-type                      (constantly :type/BigInteger)}))
