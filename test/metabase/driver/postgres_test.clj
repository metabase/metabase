(ns metabase.driver.postgres-test
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor-test :refer [rows]]
             [sync-database :as sync-db]
             [util :as u]]
            [metabase.driver
             [generic-sql :as sql]
             postgres]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.expand :as ql]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :refer [expect-with-engine]]
             [interface :as i]]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import metabase.driver.postgres.PostgresDriver))

(def ^:private ^PostgresDriver pg-driver (PostgresDriver.))

;; # Check that SSL params get added the connection details in the way we'd like
;; ## no SSL -- this should *not* include the key :ssl (regardless of its value) since that will cause the PG driver to use SSL anyway
(expect
  {:user        "camsaul"
   :classname   "org.postgresql.Driver"
   :subprotocol "postgresql"
   :subname     "//localhost:5432/bird_sightings"
   :sslmode     "disable"}
  (sql/connection-details->spec pg-driver {:ssl    false
                                           :host   "localhost"
                                           :port   5432
                                           :dbname "bird_sightings"
                                           :user   "camsaul"}))

;; ## ssl - check that expected params get added
(expect
  {:ssl         true
   :sslmode     "require"
   :classname   "org.postgresql.Driver"
   :subprotocol "postgresql"
   :user        "camsaul"
   :sslfactory  "org.postgresql.ssl.NonValidatingFactory"
   :subname     "//localhost:5432/bird_sightings"}
  (sql/connection-details->spec pg-driver {:ssl    true
                                           :host   "localhost"
                                           :port   5432
                                           :dbname "bird_sightings"
                                           :user   "camsaul"}))

;; Verify that we identify JSON columns and mark metadata properly during sync
(expect-with-engine :postgres
  :type/SerializedJSON
  (data/with-temp-db
    [_
     (i/create-database-definition "Postgres with a JSON Field"
       ["venues"
        [{:field-name "address", :base-type {:native "json"}}]
        [[(hsql/raw "to_json('{\"street\": \"431 Natoma\", \"city\": \"San Francisco\", \"state\": \"CA\", \"zip\": 94103}'::text)")]]])]
    (db/select-one-field :special_type Field, :id (data/id :venues :address))))


;;; # UUID Support
(i/def-database-definition ^:private with-uuid
  ["users"
   [{:field-name "user_id", :base-type :type/UUID}]
   [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
    [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
    [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
    [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
    [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]])


;; Check that we can load a Postgres Database with a :type/UUID
(expect-with-engine :postgres
  [{:name "id",      :base_type :type/Integer}
   {:name "user_id", :base_type :type/UUID}]
  (->> (data/dataset metabase.driver.postgres-test/with-uuid
         (data/run-query users))
       :data
       :cols
       (mapv (u/rpartial select-keys [:name :base_type]))))


;; Check that we can filter by a UUID Field
(expect-with-engine :postgres
  [[2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]]
  (rows (data/dataset metabase.driver.postgres-test/with-uuid
          (data/run-query users
            (ql/filter (ql/= $user_id "4652b2e7-d940-4d55-a971-7e484566663e"))))))

;; check that a nil value for a UUID field doesn't barf (#2152)
(expect-with-engine :postgres
  []
  (rows (data/dataset metabase.driver.postgres-test/with-uuid
          (data/run-query users
            (ql/filter (ql/= $user_id nil))))))


;; Make sure that Tables / Fields with dots in their names get escaped properly
(i/def-database-definition ^:private dots-in-names
  ["objects.stuff"
   [{:field-name "dotted.name", :base-type :type/Text}]
   [["toucan_cage"]
    ["four_loko"]
    ["ouija_board"]]])

(expect-with-engine :postgres
  {:columns ["id" "dotted.name"]
   :rows    [[1 "toucan_cage"]
             [2 "four_loko"]
             [3 "ouija_board"]]}
  (-> (data/dataset metabase.driver.postgres-test/dots-in-names
        (data/run-query objects.stuff))
      :data (dissoc :cols :native_form)))


;; Make sure that duplicate column names (e.g. caused by using a FK) still return both columns
(i/def-database-definition ^:private duplicate-names
  ["birds"
   [{:field-name "name", :base-type :type/Text}]
   [["Rasta"]
    ["Lucky"]]]
  ["people"
   [{:field-name "name", :base-type :type/Text}
    {:field-name "bird_id", :base-type :type/Integer, :fk :birds}]
   [["Cam" 1]]])

(expect-with-engine :postgres
  {:columns ["name" "name_2"]
   :rows    [["Cam" "Rasta"]]}
  (-> (data/dataset metabase.driver.postgres-test/duplicate-names
        (data/run-query people
          (ql/fields $name $bird_id->birds.name)))
      :data (dissoc :cols :native_form)))


;;; Check support for `inet` columns
(i/def-database-definition ^:private ip-addresses
  ["addresses"
   [{:field-name "ip", :base-type {:native "inet"}}]
   [[(hsql/raw "'192.168.1.1'::inet")]
    [(hsql/raw "'10.4.4.15'::inet")]]])

;; Filtering by inet columns should add the appropriate SQL cast, e.g. `cast('192.168.1.1' AS inet)` (otherwise this wouldn't work)
(expect-with-engine :postgres
  [[1]]
  (rows (data/dataset metabase.driver.postgres-test/ip-addresses
          (data/run-query addresses
            (ql/aggregation (ql/count))
            (ql/filter (ql/= $ip "192.168.1.1"))))))


;;; Util Fns

(defn- drop-if-exists-and-create-db! [db-name]
  (let [spec (sql/connection-details->spec pg-driver (i/database->connection-details pg-driver :server nil))]
    ;; kill any open connections
    (jdbc/query spec ["SELECT pg_terminate_backend(pg_stat_activity.pid)
                         FROM pg_stat_activity
                        WHERE pg_stat_activity.datname = ?;" db-name])
    ;; create the DB
    (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS %s;
                                  CREATE DATABASE %s;"
                                 db-name db-name)]
                   {:transaction? false})))


;; Check that we properly fetch materialized views.
;; As discussed in #2355 they don't come back from JDBC `DatabaseMetadata` so we have to fetch them manually.
(expect-with-engine :postgres
  {:tables #{{:schema "public", :name "test_mview"}}}
  (do
    (drop-if-exists-and-create-db! "materialized_views_test")
    (jdbc/execute! (sql/connection-details->spec pg-driver (i/database->connection-details pg-driver :server nil))
                   ["DROP DATABASE IF EXISTS materialized_views_test;
                     CREATE DATABASE materialized_views_test;"]
                   {:transaction? false})
    (let [details (i/database->connection-details pg-driver :db {:database-name "materialized_views_test"})]
      (jdbc/execute! (sql/connection-details->spec pg-driver details)
                     ["DROP MATERIALIZED VIEW IF EXISTS test_mview;
                       CREATE MATERIALIZED VIEW test_mview AS
                       SELECT 'Toucans are the coolest type of bird.' AS true_facts;"])
      (tt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "materialized_views_test")}]
        (driver/describe-database pg-driver database)))))

;; Check that we properly fetch foreign tables.
(expect-with-engine :postgres
  {:tables #{{:schema "public", :name "foreign_table"} {:schema "public", :name "local_table"}}}
  (do
    (drop-if-exists-and-create-db! "fdw_test")
    (let [details (i/database->connection-details pg-driver :db {:database-name "fdw_test"})]
      (jdbc/execute! (sql/connection-details->spec pg-driver details)
                     [(str "CREATE EXTENSION IF NOT EXISTS postgres_fdw;
                            CREATE SERVER foreign_server
                                FOREIGN DATA WRAPPER postgres_fdw
                                OPTIONS (host '" (:host details) "', port '" (:port details) "', dbname 'fdw_test');
                            CREATE TABLE public.local_table (data text);
                            CREATE FOREIGN TABLE foreign_table (data text)
                                SERVER foreign_server
                                OPTIONS (schema_name 'public', table_name 'local_table');")])
      (tt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "fdw_test")}]
        (driver/describe-database pg-driver database)))))

;; make sure that if a view is dropped and recreated that the original Table object is marked active rather than a new one being created (#3331)
(expect-with-engine :postgres
  [{:name "angry_birds", :active true}]
  (let [details (i/database->connection-details pg-driver :db {:database-name "dropped_views_test"})
        spec    (sql/connection-details->spec pg-driver details)
        exec!   #(doseq [statement %]
                   (jdbc/execute! spec [statement]))]
    ;; create the postgres DB
    (drop-if-exists-and-create-db! "dropped_views_test")
    ;; create the DB object
    (tt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "dropped_views_test")}]
      (let [sync! #(sync-db/sync-database! database, :full-sync? true)]
        ;; populate the DB and create a view
        (exec! ["CREATE table birds (name VARCHAR UNIQUE NOT NULL);"
                "INSERT INTO birds (name) VALUES ('Rasta'), ('Lucky'), ('Kanye Nest');"
                "CREATE VIEW angry_birds AS SELECT upper(name) AS name FROM birds;"])
        ;; now sync the DB
        (sync!)
        ;; drop the view
        (exec! ["DROP VIEW angry_birds;"])
        ;; sync again
        (sync!)
        ;; recreate the view
        (exec! ["CREATE VIEW angry_birds AS SELECT upper(name) AS name FROM birds;"])
        ;; sync one last time
        (sync!)
        ;; now take a look at the Tables in the database related to the view. THERE SHOULD BE ONLY ONE!
        (map (partial into {}) (db/select [Table :name :active] :db_id (u/get-id database), :name "angry_birds"))))))


;;; timezone tests

(tu/resolve-private-vars metabase.driver.generic-sql.query-processor
  run-query-with-timezone)

(defn- get-timezone-with-report-timezone [report-timezone]
  (ffirst (:rows (run-query-with-timezone pg-driver
                                          {:report-timezone report-timezone}
                                          (sql/connection-details->spec pg-driver (i/database->connection-details pg-driver :server nil))
                                          {:query "SELECT current_setting('TIMEZONE') AS timezone;"}))))

;; check that if we set report-timezone to US/Pacific that the session timezone is in fact US/Pacific
(expect-with-engine :postgres
  "US/Pacific"
  (get-timezone-with-report-timezone "US/Pacific"))

;; check that we can set it to something else: America/Chicago
(expect-with-engine :postgres
  "America/Chicago"
  (get-timezone-with-report-timezone "America/Chicago"))

;; ok, check that if we try to put in a fake timezone that the query still reëxecutes without a custom timezone. This should give us the same result as if we didn't try to set a timezone at all
(expect-with-engine :postgres
  (get-timezone-with-report-timezone nil)
  (get-timezone-with-report-timezone "Crunk Burger"))


;; make sure connection details w/ extra params work as expected
(expect
  "//localhost:5432/cool?prepareThreshold=0"
  (:subname (sql/connection-details->spec pg-driver {:host               "localhost"
                                                     :port               "5432"
                                                     :dbname             "cool"
                                                     :additional-options "prepareThreshold=0"})))
