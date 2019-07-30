(ns metabase.test.data.oracle
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [sync :as sql-jdbc.sync]]
            [metabase.test.data
             [interface :as tx]
             [sql :as sql.tx]
             [sql-jdbc :as sql-jdbc.tx]]
            [metabase.test.data.sql-jdbc
             [execute :as execute]
             [load-data :as load-data]]))

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

(def ^:private connection-details
  (delay
   {:host     (tx/db-test-env-var-or-throw :oracle :host)
    :port     (Integer/parseInt (tx/db-test-env-var-or-throw :oracle :port "1521"))
    :user     (tx/db-test-env-var-or-throw :oracle :user)
    :password (tx/db-test-env-var-or-throw :oracle :password)
    :sid      (tx/db-test-env-var-or-throw :oracle :sid)}))

(defmethod tx/dbdef->connection-details :oracle [& _] @connection-details)

(defmethod tx/sorts-nil-first? :oracle [_] false)

(defmethod sql.tx/field-base-type->sql-type [:oracle :type/BigInteger] [_ _] "NUMBER(*,0)")
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Boolean]    [_ _] "NUMBER(1)")
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Date]       [_ _] "DATE")
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/DateTime]   [_ _] "TIMESTAMP")
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Decimal]    [_ _] "DECIMAL")
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Float]      [_ _] "BINARY_FLOAT")
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Integer]    [_ _] "INTEGER")
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Text]       [_ _] "VARCHAR2(4000)")

;; If someone tries to run Time column tests with Oracle give them a heads up that Oracle does not support it
(defmethod sql.tx/field-base-type->sql-type [:oracle :type/Time] [_ _]
  (throw (UnsupportedOperationException. "Oracle does not have a TIME data type.")))

(defmethod sql.tx/drop-table-if-exists-sql :oracle [_ {:keys [database-name]} {:keys [table-name]}]
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

(defmethod sql.tx/create-db-sql :oracle [& _] nil)

(defmethod sql.tx/drop-db-if-exists-sql :oracle [& _] nil)

(defmethod execute/execute-sql! :oracle [& args]
  (apply execute/sequentially-execute-sql! args))

;; Now that connections are reüsed doing this sequentially actually seems to be faster than parallel
(defmethod load-data/load-data! :oracle [& args]
  (apply load-data/load-data-one-at-a-time! args))

(defmethod sql.tx/pk-sql-type :oracle [_]
  "INTEGER GENERATED BY DEFAULT AS IDENTITY (START WITH 1 INCREMENT BY 1) NOT NULL")

(defmethod sql.tx/qualified-name-components :oracle [& args]
  (apply tx/single-db-qualified-name-components session-schema args))

(defmethod tx/id-field-type :oracle [_] :type/Decimal)

(defmethod tx/has-questionable-timezone-support? :oracle [_] true)


;;; --------------------------------------------------- Test Setup ---------------------------------------------------

(defn- dbspec [& _]
  (sql-jdbc.conn/connection-details->spec :oracle @connection-details))

(defn- non-session-schemas
  "Return a set of the names of schemas (users) that are not meant for use in this test session (i.e., ones that should
  be ignored). (This is used as part of the implementation of `excluded-schemas` for the Oracle driver during tests.)"
  []
  (set (map :username (jdbc/query (dbspec) ["SELECT username FROM dba_users WHERE username <> ?" session-schema]))))

(let [orig (get-method sql-jdbc.sync/excluded-schemas :oracle)]
  (defmethod sql-jdbc.sync/excluded-schemas :oracle [driver]
    (set/union
     (orig driver)
     (when config/is-test?
       ;; This is similar hack we do for Redshift, see the explanation there we just want to ignore all the test
       ;; "session schemas" that don't match the current test
       (non-session-schemas)))))


;;; Clear out the sesion schema before and after tests run
;; TL;DR Oracle schema == Oracle user. Create new user for session-schema
(defn- execute! [format-string & args]
  (let [sql (apply format format-string args)]
    (println (u/format-color 'blue "[oracle] %s" sql))
    (jdbc/execute! (dbspec) sql))
  (println (u/format-color 'blue "[ok]")))

(defn- clean-session-schemas! []
  "Delete any old session users that for some reason or another were never deleted. For REPL usage."
  (doseq [schema (non-session-schemas)
          :when  (re-find #"^CAM_" schema)]
    (execute! "DROP USER %s CASCADE" schema)))

(defn create-user!
  ;; default to using session-password for all users created this session
  ([username]
   (create-user! username session-password))
  ([username password]
   (execute! "CREATE USER %s IDENTIFIED BY %s DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS"
             username
             password)))

(defn drop-user! [username]
  (u/ignore-exceptions
   (execute! "DROP USER %s CASCADE" username)))

(defmethod tx/before-run :oracle [_]
  (drop-user! session-schema)
  (create-user! session-schema))

(defmethod tx/after-run :oracle [_]
  (drop-user! session-schema))
