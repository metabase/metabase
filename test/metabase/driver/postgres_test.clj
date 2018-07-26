(ns metabase.driver.postgres-test
  "Tests for features/capabilities specific to PostgreSQL driver, such as support for Postgres UUID or enum types."
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :refer [rows]]
             [sync :as sync]
             [util :as u]]
            [metabase.driver
             [generic-sql :as sql]
             [postgres :as postgres]]
            [metabase.driver.generic-sql.query-processor :as sqlqp]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.interface :as qpi]
            [metabase.query-processor.middleware.expand :as ql]
            [metabase.sync.sync-metadata :as sync-metadata]
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

;; Check that SSL params get added the connection details in the way we'd like # no SSL -- this should *not* include
;; the key :ssl (regardless of its value) since that will cause the PG driver to use SSL anyway
(expect
  {:user        "camsaul"
   :classname   "org.postgresql.Driver"
   :subprotocol "postgresql"
   :subname     "//localhost:5432/bird_sightings?OpenSourceSubProtocolOverride=true"
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
   :subname     "//localhost:5432/bird_sightings?OpenSourceSubProtocolOverride=true"}
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
  [["users"
     [{:field-name "user_id", :base-type :type/UUID}]
     [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
      [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
      [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
      [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
      [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]]])

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

;; Check that we can filter by a UUID for SQL Field filters (#7955)
(expect-with-engine :postgres
  [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027" 1]]
  (data/dataset metabase.driver.postgres-test/with-uuid
    (rows (qp/process-query {:database   (data/id)
                             :type       :native
                             :native     {:query         "SELECT * FROM users WHERE {{user}}"
                                          :template_tags {:user {:name         "user"
                                                                 :display_name "User ID"
                                                                 :type         "dimension"
                                                                 :dimension    ["field-id" (data/id :users :user_id)]}}}
                             :parameters [{:type   "text"
                                           :target ["dimension" ["template-tag" "user"]]
                                           :value  "4f01dcfd-13f7-430c-8e6f-e505c0851027"}]}))))


;; Make sure that Tables / Fields with dots in their names get escaped properly
(i/def-database-definition ^:private dots-in-names
  [["objects.stuff"
     [{:field-name "dotted.name", :base-type :type/Text}]
     [["toucan_cage"]
      ["four_loko"]
      ["ouija_board"]]]])

(expect-with-engine :postgres
  {:columns ["id" "dotted.name"]
   :rows    [[1 "toucan_cage"]
             [2 "four_loko"]
             [3 "ouija_board"]]}
  (-> (data/dataset metabase.driver.postgres-test/dots-in-names
        (data/run-query objects.stuff))
      :data (dissoc :cols :native_form :results_metadata)))


;; Make sure that duplicate column names (e.g. caused by using a FK) still return both columns
(i/def-database-definition ^:private duplicate-names
  [["birds"
     [{:field-name "name", :base-type :type/Text}]
     [["Rasta"]
      ["Lucky"]]]
   ["people"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "bird_id", :base-type :type/Integer, :fk :birds}]
    [["Cam" 1]]]])

(expect-with-engine :postgres
  {:columns ["name" "name_2"]
   :rows    [["Cam" "Rasta"]]}
  (-> (data/dataset metabase.driver.postgres-test/duplicate-names
        (data/run-query people
          (ql/fields $name $bird_id->birds.name)))
      :data (dissoc :cols :native_form :results_metadata)))


;;; Check support for `inet` columns
(i/def-database-definition ^:private ip-addresses
  [["addresses"
     [{:field-name "ip", :base-type {:native "inet"}}]
     [[(hsql/raw "'192.168.1.1'::inet")]
      [(hsql/raw "'10.4.4.15'::inet")]]]])

;; Filtering by inet columns should add the appropriate SQL cast, e.g. `cast('192.168.1.1' AS inet)` (otherwise this
;; wouldn't work)
(expect-with-engine :postgres
  [[1]]
  (rows (data/dataset metabase.driver.postgres-test/ip-addresses
          (data/run-query addresses
            (ql/aggregation (ql/count))
            (ql/filter (ql/= $ip "192.168.1.1"))))))


;;; Util Fns

(defn drop-if-exists-and-create-db!
  "Drop a Postgres database named `db-name` if it already exists; then create a new empty one with that name."
  [db-name]
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

;; make sure that if a view is dropped and recreated that the original Table object is marked active rather than a new
;; one being created (#3331)
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
      (let [sync! #(sync/sync-database! database)]
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

(defn- get-timezone-with-report-timezone [report-timezone]
  (ffirst (:rows (#'sqlqp/run-query-with-timezone
                  pg-driver
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

;; ok, check that if we try to put in a fake timezone that the query still reëxecutes without a custom timezone. This
;; should give us the same result as if we didn't try to set a timezone at all
(expect-with-engine :postgres
  (get-timezone-with-report-timezone nil)
  (get-timezone-with-report-timezone "Crunk Burger"))


;; make sure connection details w/ extra params work as expected
(expect
  "//localhost:5432/cool?OpenSourceSubProtocolOverride=true&prepareThreshold=0"
  (:subname (sql/connection-details->spec pg-driver {:host               "localhost"
                                                     :port               "5432"
                                                     :dbname             "cool"
                                                     :additional-options "prepareThreshold=0"})))

(expect-with-engine :postgres
  "UTC"
  (tu/db-timezone-id))

;; Make sure we're able to fingerprint TIME fields (#5911)
(expect-with-engine :postgres
                    #{#metabase.models.field.FieldInstance{:name "start_time", :fingerprint {:global {:distinct-count 1}
                                                                                             :type {:type/DateTime {:earliest "1970-01-01T22:00:00.000Z", :latest "1970-01-01T22:00:00.000Z"}}}}
                      #metabase.models.field.FieldInstance{:name "end_time",   :fingerprint {:global {:distinct-count 1}
                                                                                             :type {:type/DateTime {:earliest "1970-01-01T09:00:00.000Z", :latest "1970-01-01T09:00:00.000Z"}}}}
    #metabase.models.field.FieldInstance{:name "reason",     :fingerprint {:global {:distinct-count 1}
                                                                           :type   {:type/Text {:percent-json    0.0
                                                                                                :percent-url     0.0
                                                                                                :percent-email   0.0
                                                                                                :average-length 12.0}}}}}
  (do
    (drop-if-exists-and-create-db! "time_field_test")
    (let [details (i/database->connection-details pg-driver :db {:database-name "time_field_test"})]
      (jdbc/execute! (sql/connection-details->spec pg-driver details)
                     [(str "CREATE TABLE toucan_sleep_schedule ("
                           "  start_time TIME WITHOUT TIME ZONE NOT NULL, "
                           "  end_time TIME WITHOUT TIME ZONE NOT NULL, "
                           "  reason VARCHAR(256) NOT NULL"
                           ");"
                           "INSERT INTO toucan_sleep_schedule (start_time, end_time, reason) "
                           "  VALUES ('22:00'::time, '9:00'::time, 'Beauty Sleep');")])
      (tt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "time_field_test")}]
        (sync/sync-database! database)
        (set (db/select [Field :name :fingerprint] :table_id (db/select-one-id Table :db_id (u/get-id database))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             POSTGRES ENUM SUPPORT                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- enums-test-db-details [] (i/database->connection-details pg-driver :db {:database-name "enums_test"}))

(defn- create-enums-db!
  "Create a Postgres database called `enums_test` that has a couple of enum types and a couple columns of those types.
  One of those types has a space in the name, which is legal when quoted, to make sure we handle such wackiness
  properly."
  []
  (drop-if-exists-and-create-db! "enums_test")
  (jdbc/with-db-connection [conn (sql/connection-details->spec pg-driver (enums-test-db-details))]
    (doseq [sql ["CREATE TYPE \"bird type\" AS ENUM ('toucan', 'pigeon', 'turkey');"
                 "CREATE TYPE bird_status AS ENUM ('good bird', 'angry bird', 'delicious bird');"
                 (str "CREATE TABLE birds ("
                      "  name varchar PRIMARY KEY NOT NULL,"
                      "  type \"bird type\" NOT NULL,"
                      "  status bird_status NOT NULL"
                      ");")
                 (str "INSERT INTO birds (\"name\", \"type\", status) VALUES"
                      "  ('Rasta', 'toucan', 'good bird'),"
                      "  ('Lucky', 'pigeon', 'angry bird'),"
                      "  ('Theodore', 'turkey', 'delicious bird');")]]
      (jdbc/execute! conn [sql]))))

(defn- do-with-enums-db {:style/indent 0} [f]
  (create-enums-db!)
  (tt/with-temp Database [database {:engine :postgres, :details (enums-test-db-details)}]
    (sync-metadata/sync-db-metadata! database)
    (f database)))

;; check that we can actually fetch the enum types from a DB
(expect-with-engine :postgres
  #{(keyword "bird type") :bird_status}
  (do-with-enums-db
    (fn [db]
      (#'postgres/enum-types db))))

;; check that describe-table properly describes the database & base types of the enum fields
(expect-with-engine :postgres
  {:name   "birds"
   :fields #{{:name          "name",
              :database-type "varchar"
              :base-type     :type/Text
              :pk?           true}
             {:name          "status"
              :database-type "bird_status"
              :base-type     :type/PostgresEnum}
             {:name          "type"
              :database-type "bird type"
              :base-type     :type/PostgresEnum}}}
  (do-with-enums-db
    (fn [db]
      (driver/describe-table pg-driver db {:name "birds"}))))

;; check that when syncing the DB the enum types get recorded appropriately
(expect-with-engine :postgres
  #{{:name "name",   :database_type "varchar",     :base_type :type/Text}
    {:name "type",   :database_type "bird type",   :base_type :type/PostgresEnum}
    {:name "status", :database_type "bird_status", :base_type :type/PostgresEnum}}
  (do-with-enums-db
    (fn [db]
      (let [table-id (db/select-one-id Table :db_id (u/get-id db), :name "birds")]
        (set (map (partial into {})
                  (db/select [Field :name :database_type :base_type] :table_id table-id)))))))


;; check that values for enum types get wrapped in appropriate CAST() fn calls in `->honeysql`
(expect-with-engine :postgres
  {:name :cast, :args ["toucan" (keyword "bird type")]}
  (sqlqp/->honeysql pg-driver (qpi/map->Value {:field {:database-type "bird type", :base-type :type/PostgresEnum}
                                               :value "toucan"})))

;; End-to-end check: make sure everything works as expected when we run an actual query
(expect-with-engine :postgres
  {:rows        [["Rasta" "good bird" "toucan"]]
   :native_form {:query  (str "SELECT \"public\".\"birds\".\"name\" AS \"name\","
                              " \"public\".\"birds\".\"status\" AS \"status\","
                              " \"public\".\"birds\".\"type\" AS \"type\" "
                              "FROM \"public\".\"birds\" "
                              "WHERE \"public\".\"birds\".\"type\" = CAST(? AS \"bird type\") "
                              "LIMIT 10")
                 :params ["toucan"]}}
  (do-with-enums-db
    (fn [db]
      (let [table-id           (db/select-one-id Table :db_id (u/get-id db), :name "birds")
            bird-type-field-id (db/select-one-id Field :table_id table-id, :name "type")]
        (-> (qp/process-query
              {:database (u/get-id db)
               :type     :query
               :query    {:source-table table-id
                          :filter       [:= [:field-id (u/get-id bird-type-field-id)] "toucan"]
                          :limit        10}})
            :data
            (select-keys [:rows :native_form]))))))
