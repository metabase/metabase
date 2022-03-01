(ns metabase.test.data.oracle
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.string :as str]
            [honeysql.format :as hformat]
            [medley.core :as m]
            [metabase.db :as mdb]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.models :refer [Database Table]]
            [metabase.test.data.impl :as data.impl]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
            [metabase.test.data.sql-jdbc.execute :as execute]
            [metabase.test.data.sql-jdbc.load-data :as load-data]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.util :as u]
            [toucan.db :as db]))

(sql-jdbc.tx/add-test-extensions! :oracle)

;; Similar to SQL Server, Oracle on AWS doesn't let you create different databases;
;; We'll create a unique schema (the same as a "User" in Oracle-land) for each test run and use that to keep
;; tests from clobbering over one another; we'll also qualify the names of tables to include their DB name
;;
;; e.g.
;; H2 Tests                   | Oracle Tests
;; ---------------------------+------------------------------------------------
;; PUBLIC.VENUES.ID           | CAM_195.test_data_venues.id
;; PUBLIC.CHECKINS.USER_ID    | CAM_195.test_data_checkins.user_id
;; PUBLIC.INCIDENTS.TIMESTAMP | CAM_195.sad_toucan_incidents.timestamp
(defonce ^:private session-schema-number (rand-int 200))
(defonce           session-schema        (str "CAM_" session-schema-number))
(defonce ^:private session-password      (apply str (repeatedly 16 #(rand-nth (map char (range (int \a) (inc (int \z))))))))
;; Session password is only used when creating session user, not anywhere else

(defn- connection-details []
  (let [details* {:host         (tx/db-test-env-var-or-throw :oracle :host "localhost")
                  :port         (Integer/parseInt (tx/db-test-env-var-or-throw :oracle :port "1521"))
                  :user         (tx/db-test-env-var-or-throw :oracle :user "system")
                  :password     (tx/db-test-env-var-or-throw :oracle :password "password")
                  :sid          (tx/db-test-env-var :oracle :sid)
                  :service-name (tx/db-test-env-var :oracle :service-name (when-not (tx/db-test-env-var :oracle :sid) "XEPDB1"))
                  :ssl          (tx/db-test-env-var :oracle :ssl false)}
        ssl-keys [:ssl-use-truststore :ssl-truststore-options :ssl-truststore-path :ssl-truststore-value
                  :ssl-truststore-password-value
                  :ssl-use-keystore :ssl-use-keystore-options :ssl-keystore-path :ssl-keystore-value
                  :ssl-keystore-password-value]]
    (merge details*
      (m/filter-vals some?
        (zipmap ssl-keys (map #(tx/db-test-env-var :oracle % nil) ssl-keys))))))

(defmethod tx/dbdef->connection-details :oracle [& _]
  (let [conn-details (connection-details)]
    (identity conn-details)))

(defmethod tx/sorts-nil-first? :oracle [_ _] false)

(doseq [[base-type sql-type] {:type/BigInteger             "NUMBER(*,0)"
                              :type/Boolean                "NUMBER(1)"
                              :type/Date                   "DATE"
                              :type/Temporal               "TIMESTAMP"
                              :type/DateTime               "TIMESTAMP"
                              :type/DateTimeWithTZ         "TIMESTAMP WITH TIME ZONE"
                              :type/DateTimeWithLocalTZ    "TIMESTAMP WITH LOCAL TIME ZONE"
                              :type/DateTimeWithZoneOffset "TIMESTAMP WITH TIME ZONE"
                              :type/DateTimeWithZoneID     "TIMESTAMP WITH TIME ZONE"
                              :type/Decimal                "DECIMAL"
                              :type/Float                  "BINARY_FLOAT"
                              :type/Integer                "INTEGER"
                              :type/Text                   "VARCHAR2(4000)"}]
  (defmethod sql.tx/field-base-type->sql-type [:oracle base-type] [_ _] sql-type))

;; If someone tries to run Time column tests with Oracle give them a heads up that Oracle does not support it
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Time]
  [_ _]
  (throw (UnsupportedOperationException. "Oracle does not have a TIME data type.")))

(defmethod sql.tx/drop-table-if-exists-sql :oracle
  [_ {:keys [database-name]} {:keys [table-name]}]
  ;; ⅋ replaced with `;` in the actual executed SQL; `;` itself is automatically removed Missing IN or OUT parameter
  (format "BEGIN
             EXECUTE IMMEDIATE 'DROP TABLE \"%s\".\"%s\" CASCADE CONSTRAINTS'⅋
           EXCEPTION
             WHEN OTHERS THEN
               IF SQLCODE != -942 THEN
                 RAISE⅋
               END IF⅋
           END⅋"
          session-schema
          (tx/db-qualified-table-name database-name table-name)))

(defonce ^:private oracle-test-dbs-created-by-this-instance (atom #{}))

(defn- destroy-test-database-if-created-in-different-session
  "For Oracle, we have a randomly selected `session-schema`, in order to allow different test runs to proceed
  independently. This is basically `PREFIX_N` where `PREFIX` is a fixed prefix, and `N` is a random number.

  Within any given schema, the same `test-data` tables are created, synced, queried in an identical manner, etc.
  However, if we happen to have a `test-data` `DatabaseInstance` already in our app DB, that was created under a
  different session, then we should just destroy it so that it can be recreated. That is because the `session-schema`
  that was in play, when it was created, in all likelihood, does NOT match the current `session-schema` (from this
  REPL/Metabase instance).

  We won't reliably be able to resync it into the current session, since we didn't control its creation and lifecycle
  (in fact, some other process may be cleaning it up at the same instant that our tests are running in this instance).
  Because of this, we should just delete any existing `test-data` instance we find so that our current session can
  recreate it in a sane and predictable manner.

  Note this does problem not (currently) come into play in the CI environment, since the H2 app DB is created fresh on
  every driver test run. In that situation, there is no existing `test-data` `DatabaseInstance` in the app DB, because
  there are NO rows in the app DB at all. So this logic is only to make local REPL testing work properly."
  [database-name]
  (when-not (contains? @oracle-test-dbs-created-by-this-instance database-name)
    (locking oracle-test-dbs-created-by-this-instance
      (when-not (contains? @oracle-test-dbs-created-by-this-instance database-name)
        (mdb/setup-db!)                 ; if not already setup
        (when-let [existing-db (db/select-one Database :engine "oracle", :name database-name)]
          (let [existing-db-id (u/the-id existing-db)
                all-schemas    (db/select-field :schema Table :db_id existing-db-id)]
            (when-not (= all-schemas #{session-schema})
              (println (u/format-color 'yellow
                                       (str "[oracle] At least one table's schema for the existing '%s' Database"
                                            " (id %d), which include all of [%s], does not match current session-schema"
                                            " of %s; deleting this DB so it can be recreated")
                                       database-name
                                       existing-db-id
                                       (str/join "," all-schemas)
                                       session-schema))
              (db/delete! Database :id existing-db-id))))
        (swap! oracle-test-dbs-created-by-this-instance conj database-name)))))

(defmethod data.impl/get-or-create-database! :oracle
  [driver dbdef]
  (let [{:keys [database-name], :as dbdef} (tx/get-dataset-definition dbdef)]
    (destroy-test-database-if-created-in-different-session database-name)
    ((get-method data.impl/get-or-create-database! :sql-jdbc) driver dbdef)))

(defmethod sql.tx/create-db-sql :oracle [& _] nil)

(defmethod sql.tx/drop-db-if-exists-sql :oracle [& _] nil)

(defmethod execute/execute-sql! :oracle [& args]
  (apply execute/sequentially-execute-sql! args))

(defmethod sql.tx/pk-sql-type :oracle [_]
  "INTEGER GENERATED BY DEFAULT AS IDENTITY (START WITH 1 INCREMENT BY 1) NOT NULL")

(defmethod sql.tx/qualified-name-components :oracle [& args]
  (apply tx/single-db-qualified-name-components session-schema args))

(defmethod tx/id-field-type :oracle [_] :type/Decimal)

(defmethod load-data/load-data! :oracle
  [driver dbdef tabledef]
  (load-data/load-data-add-ids-chunked! driver dbdef tabledef))

(defmethod tx/has-questionable-timezone-support? :oracle [_] true)

;; Oracle has weird syntax for inserting multiple rows, it looks like
;;
;; INSERT ALL
;;     INTO table (col1,col2) VALUES (val1,val2)
;;     INTO table (col1,col2) VALUES (val1,val2)
;; SELECT * FROM dual;
;;
;; So this custom HoneySQL type below generates the correct DDL statement
(defmethod ddl/insert-rows-honeysql-form :oracle
  [driver table-identifier row-or-rows]
  (reify hformat/ToSql
    (to-sql [_]
      (format
       "INSERT ALL %s SELECT * FROM dual"
       (str/join
        " "
        (for [row  (u/one-or-many row-or-rows)
              :let [columns (keys row)]]
          (str/replace
           (hformat/to-sql
            ((get-method ddl/insert-rows-honeysql-form :sql/test-extensions) driver table-identifier row))
           #"INSERT INTO"
           "INTO")))))))

(defn- dbspec [& _]
  (let [conn-details  (connection-details)]
    (sql-jdbc.conn/connection-details->spec :oracle conn-details)))

(defn- non-session-schemas
  "Return a set of the names of schemas (users) that are not meant for use in this test session (i.e., ones that should
  be ignored). (This is used as part of the implementation of `excluded-schemas` for the Oracle driver during tests.)"
  []
  (set (map :username (jdbc/query (dbspec) ["SELECT username FROM dba_users WHERE username <> ?" session-schema]))))

(defonce ^:private original-excluded-schemas
  (get-method sql-jdbc.sync/excluded-schemas :oracle))

(defmethod sql-jdbc.sync/excluded-schemas :oracle
  [driver]
  (set/union
   (original-excluded-schemas driver)
   ;; This is similar hack we do for Redshift, see the explanation there we just want to ignore all the test
   ;; "session schemas" that don't match the current test
   (non-session-schemas)))


;;; Clear out the session schema before and after tests run
;; TL;DR Oracle schema == Oracle user. Create new user for session-schema
(defn- execute! [format-string & args]
  (let [sql (apply format format-string args)]
    (println (u/format-color 'blue "[oracle] %s" sql))
    (jdbc/execute! (dbspec) sql))
  (println (u/format-color 'blue "[ok]")))

(defn create-user!
  ;; default to using session-password for all users created this session
  ([username]
   (create-user! username session-password))
  ([username password]
   (execute! "CREATE USER \"%s\" IDENTIFIED BY \"%s\" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS"
             username
             password)))

(defn drop-user! [username]
  (u/ignore-exceptions
   (execute! "DROP USER %s CASCADE" username)))

(defmethod tx/before-run :oracle
  [_]
  (drop-user! session-schema)
  (create-user! session-schema))

(defmethod tx/aggregate-column-info :oracle
  ([driver ag-type]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Decimal})))

  ([driver ag-type field]
   (merge
    ((get-method tx/aggregate-column-info ::tx/test-extensions) driver ag-type field)
    (when (#{:count :cum-count} ag-type)
      {:base_type :type/Decimal}))))
