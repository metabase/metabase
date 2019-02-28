(ns metabase.driver.oracle-test
  "Tests for specific behavior of the Oracle driver."
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :refer [expect-with-driver]]
             [oracle :as oracle.tx]
             [sql :as sql.tx]]
            [metabase.test.util.log :as tu.log]
            [toucan.util.test :as tt]))

;; make sure we can connect with an SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521:ORCL"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                   :port 1521
                                                   :sid  "ORCL"}))

;; no SID and not Service Name should throw an exception
(expect
  AssertionError
  (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                   :port 1521}))

(expect
  "You must specify the SID and/or the Service Name."
  (try (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                        :port 1521})
       (catch Throwable e
         (driver/humanize-connection-error-message :oracle (.getMessage e)))))

;; make sure you can specify a Service Name with no SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521/MyCoolService"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle {:host         "localhost"
                                                   :port         1521
                                                   :service-name "MyCoolService"}))

;; make sure you can specify a Service Name and an SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521:ORCL/MyCoolService"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle {:host         "localhost"
                                                   :port         1521
                                                   :service-name "MyCoolService"
                                                   :sid          "ORCL"}))


(expect
  com.jcraft.jsch.JSchException
  (let [engine  :oracle
        details {:ssl            false
                 :password       "changeme"
                 :tunnel-host    "localhost"
                 :tunnel-pass    "BOGUS-BOGUS-BOGUS"
                 :port           12345
                 :service-name   "test"
                 :sid            "asdf"
                 :host           "localhost"
                 :tunnel-enabled true
                 :tunnel-port    22
                 :user           "postgres"
                 :tunnel-user    "example"}]
    (tu.log/suppress-output
      (driver/can-connect? :oracle details))))

(expect-with-driver :oracle
  "UTC"
  (tu/db-timezone-id))

(defn- do-with-temp-user [f]
  (let [username (tu/random-name)]
    (try
      (oracle.tx/create-user! username)
      (f username)
      (finally
        (oracle.tx/drop-user! username)))))

(defmacro ^:private with-temp-user
  "Run `body` with a temporary user bound, binding their name to `username-binding`. Use this to create the equivalent
  of temporary one-off databases."
  [[username-binding] & body]
  `(do-with-temp-user (fn [~username-binding] ~@body)))


;; Make sure Oracle CLOBs are returned as text (#9026)
(expect-with-driver :oracle
  [[1M "Hello"]
   [2M nil]]
  (let [details  (:details (data/db))
        spec     (sql-jdbc.conn/connection-details->spec :oracle details)
        execute! (fn [format-string & args]
                   (jdbc/execute! spec (apply format format-string args)))
        pk-type  (sql.tx/pk-sql-type :oracle)]
    (with-temp-user [username]
      (execute! "CREATE TABLE \"%s\".\"messages\" (\"id\" %s, \"message\" CLOB)"            username pk-type)
      (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (1, 'Hello')" username)
      (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (2, NULL)"    username)
      (tt/with-temp* [Table [table {:schema username, :name "messages", :db_id (data/id)}]
                      Field [_     {:table_id (u/get-id table), :name "id",      :base_type "type/Integer"}]
                      Field [_     {:table_id (u/get-id table), :name "message", :base_type "type/Text"}]]
        (qp.test/rows
          (qp/process-query
            {:database (data/id)
             :type     :query
             :query    {:source-table (u/get-id table)}}))))))

(defn- num-open-cursors
  "Get the number of open cursors for current User"
  []
  (let [{:keys [details]}   (driver/with-driver :oracle (data/db))
        spec                (sql-jdbc.conn/connection-details->spec :oracle details)
        [{:keys [cursors]}] (jdbc/query
                             spec
                             [(str
                               "SELECT sum(a.value) AS cursors "
                               "FROM v$sesstat a, v$statname b, v$session s "
                               "WHERE a.statistic# = b.statistic# "
                               "  AND s.sid=a.sid "
                               "  AND lower(s.username) = lower(?) "
                               "  AND b.name = 'opened cursors current'")
                              (:user details)])]
    (some-> cursors int)))

;; make sure that running the sync process doesn't leak cursors because it's not closing the ResultSets
;; See issues #4389, #6028, and #6467
(expect-with-driver :oracle
  "Number of open cursors has stabilized. No leak in sync process."
  (let [num-tries 30]
    (loop [last-num-cursors (num-open-cursors), remaining-tries num-tries]
      ;; actually to really saturate this connection pool it's even better to run 20 sync processes at the same time
      ;; and then see if things stabilize
      (dorun
       (pmap
        (fn [_] (driver/describe-database :oracle (data/db)))
        (range 20)))
      (let [new-open-cursors (num-open-cursors)]
        (cond
          (<= new-open-cursors last-num-cursors)
          "Number of open cursors has stabilized. No leak in sync process."

          (pos? remaining-tries)
          (recur new-open-cursors (dec remaining-tries))

          :else
          (format "Number of open cursors has not stabilized after %d tries. Number of open cursors: %d"
                  num-tries new-open-cursors))))))
