(ns metabase.driver.postgres-test
  "Tests for features/capabilities specific to PostgreSQL driver, such as support for Postgres UUID or enum types."
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :refer [rows rows+column-names]]
             [sync :as sync]
             [util :as u]]
            [metabase.driver.postgres :as postgres]
            [metabase.driver.sql-jdbc
             [connection :as sql-jdbc.conn]
             [execute :as sql-jdbc.execute]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.sync.sync-metadata :as sync-metadata]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [interface :as tx]]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; Check that SSL params get added the connection details in the way we'd like # no SSL -- this should *not* include
;; the key :ssl (regardless of its value) since that will cause the PG driver to use SSL anyway
(expect
  {:classname                     "org.postgresql.Driver"
   :subprotocol                   "postgresql"
   :subname                       "//localhost:5432/bird_sightings"
   :OpenSourceSubProtocolOverride true
   :user                          "camsaul"
   :sslmode                       "disable"}
  (sql-jdbc.conn/connection-details->spec :postgres
    {:ssl    false
     :host   "localhost"
     :port   5432
     :dbname "bird_sightings"
     :user   "camsaul"}))

;; ## ssl - check that expected params get added
(expect
  {:classname                     "org.postgresql.Driver"
   :subprotocol                   "postgresql"
   :subname                       "//localhost:5432/bird_sightings"
   :OpenSourceSubProtocolOverride true
   :user                          "camsaul"
   :ssl                           true
   :sslmode                       "require"
   :sslfactory                    "org.postgresql.ssl.NonValidatingFactory"}
  (sql-jdbc.conn/connection-details->spec :postgres
    {:ssl    true
     :host   "localhost"
     :port   5432
     :dbname "bird_sightings"
     :user   "camsaul"}))

;; Verify that we identify JSON columns and mark metadata properly during sync
(datasets/expect-with-driver :postgres
  :type/SerializedJSON
  (data/dataset (tx/dataset-definition "Postgres with a JSON Field"
                  ["venues"
                   [{:field-name "address", :base-type {:native "json"}}]
                   [[(hsql/raw "to_json('{\"street\": \"431 Natoma\", \"city\": \"San Francisco\", \"state\": \"CA\", \"zip\": 94103}'::text)")]]])
    (db/select-one-field :special_type Field, :id (data/id :venues :address))))


;;; # UUID Support
(tx/defdataset ^:private with-uuid
  [["users"
    [{:field-name "user_id", :base-type :type/UUID}]
    [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
     [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
     [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
     [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
     [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]]])

;; Check that we can load a Postgres Database with a :type/UUID
(datasets/expect-with-driver :postgres
  [{:name "id",      :base_type :type/Integer}
   {:name "user_id", :base_type :type/UUID}]
  (->> (data/dataset metabase.driver.postgres-test/with-uuid
         (data/run-mbql-query users))
       :data
       :cols
       (mapv (u/rpartial select-keys [:name :base_type]))))


;; Check that we can filter by a UUID Field
(datasets/expect-with-driver :postgres
  [[2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]]
  (rows (data/dataset metabase.driver.postgres-test/with-uuid
          (data/run-mbql-query users
            {:filter [:= $user_id "4652b2e7-d940-4d55-a971-7e484566663e"]}))))

;; check that a nil value for a UUID field doesn't barf (#2152)
(datasets/expect-with-driver :postgres
  []
  (rows (data/dataset metabase.driver.postgres-test/with-uuid
          (data/run-mbql-query users
            {:filter [:= $user_id nil]}))))

;; Check that we can filter by a UUID for SQL Field filters (#7955)
(datasets/expect-with-driver :postgres
  [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027" 1]]
  (data/dataset metabase.driver.postgres-test/with-uuid
    (rows (qp/process-query {:database   (data/id)
                             :type       :native
                             :native     {:query         "SELECT * FROM users WHERE {{user}}"
                                          :template-tags {:user {:name         "user"
                                                                 :display_name "User ID"
                                                                 :type         "dimension"
                                                                 :dimension    ["field-id" (data/id :users :user_id)]}}}
                             :parameters [{:type   "text"
                                           :target ["dimension" ["template-tag" "user"]]
                                           :value  "4f01dcfd-13f7-430c-8e6f-e505c0851027"}]}))))


;; Make sure that Tables / Fields with dots in their names get escaped properly
(tx/defdataset ^:private dots-in-names
  [["objects.stuff"
    [{:field-name "dotted.name", :base-type :type/Text}]
    [["toucan_cage"]
     ["four_loko"]
     ["ouija_board"]]]])

(datasets/expect-with-driver :postgres
  {:columns ["id" "dotted.name"]
   :rows    [[1 "toucan_cage"]
             [2 "four_loko"]
             [3 "ouija_board"]]}
  (-> (data/dataset metabase.driver.postgres-test/dots-in-names
        (data/run-mbql-query objects.stuff))
      rows+column-names))


;; Make sure that duplicate column names (e.g. caused by using a FK) still return both columns
(tx/defdataset ^:private duplicate-names
  [["birds"
    [{:field-name "name", :base-type :type/Text}]
    [["Rasta"]
     ["Lucky"]]]
   ["people"
    [{:field-name "name", :base-type :type/Text}
     {:field-name "bird_id", :base-type :type/Integer, :fk :birds}]
    [["Cam" 1]]]])

(datasets/expect-with-driver :postgres
  {:columns ["name" "name_2"]
   :rows    [["Cam" "Rasta"]]}
  (-> (data/dataset metabase.driver.postgres-test/duplicate-names
        (data/run-mbql-query people
          {:fields [$name $bird_id->birds.name]}))
      rows+column-names))


;;; Check support for `inet` columns
(tx/defdataset ^:private ip-addresses
  [["addresses"
    [{:field-name "ip", :base-type {:native "inet"}}]
    [[(hsql/raw "'192.168.1.1'::inet")]
     [(hsql/raw "'10.4.4.15'::inet")]]]])

;; Filtering by inet columns should add the appropriate SQL cast, e.g. `cast('192.168.1.1' AS inet)` (otherwise this
;; wouldn't work)
(datasets/expect-with-driver :postgres
  [[1]]
  (rows (data/dataset metabase.driver.postgres-test/ip-addresses
          (data/run-mbql-query addresses
            {:aggregation [[:count]]
             :filter      [:= $ip "192.168.1.1"]}))))


;;; Util Fns

(defn drop-if-exists-and-create-db!
  "Drop a Postgres database named `db-name` if it already exists; then create a new empty one with that name."
  [db-name]
  (let [spec (sql-jdbc.conn/connection-details->spec :postgres (tx/dbdef->connection-details :postgres :server nil))]
    ;; kill any open connections
    (jdbc/query spec ["SELECT pg_terminate_backend(pg_stat_activity.pid)
                         FROM pg_stat_activity
                        WHERE pg_stat_activity.datname = ?;" db-name])
    ;; create the DB
    (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS \"%s\";
                                  CREATE DATABASE \"%s\";"
                                 db-name db-name)]
                   {:transaction? false})))

(defn- default-table-result [table-name]
  {:name table-name, :schema "public", :description nil})

;; Check that we properly fetch materialized views.
;; As discussed in #2355 they don't come back from JDBC `DatabaseMetadata` so we have to fetch them manually.
(datasets/expect-with-driver :postgres
  {:tables #{(default-table-result "test_mview")}}
  (do
    (drop-if-exists-and-create-db! "materialized_views_test")
    (let [details (tx/dbdef->connection-details :postgres :db {:database-name "materialized_views_test"})]
      (jdbc/execute! (sql-jdbc.conn/connection-details->spec :postgres details)
                     ["DROP MATERIALIZED VIEW IF EXISTS test_mview;
                       CREATE MATERIALIZED VIEW test_mview AS
                       SELECT 'Toucans are the coolest type of bird.' AS true_facts;"])
      (tt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "materialized_views_test")}]
        (driver/describe-database :postgres database)))))

;; Check that we properly fetch foreign tables.
(datasets/expect-with-driver :postgres
  {:tables (set (map default-table-result ["foreign_table" "local_table"]))}
  (do
    (drop-if-exists-and-create-db! "fdw_test")
    (let [details (tx/dbdef->connection-details :postgres :db {:database-name "fdw_test"})]
      (jdbc/execute! (sql-jdbc.conn/connection-details->spec :postgres details)
                     [(str "CREATE EXTENSION IF NOT EXISTS postgres_fdw;
                            CREATE SERVER foreign_server
                                FOREIGN DATA WRAPPER postgres_fdw
                                OPTIONS (host '" (:host details) "', port '" (:port details) "', dbname 'fdw_test');
                            CREATE TABLE public.local_table (data text);
                            CREATE FOREIGN TABLE foreign_table (data text)
                                SERVER foreign_server
                                OPTIONS (schema_name 'public', table_name 'local_table');")])
      (tt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "fdw_test")}]
        (driver/describe-database :postgres database)))))

;; make sure that if a view is dropped and recreated that the original Table object is marked active rather than a new
;; one being created (#3331)
(datasets/expect-with-driver :postgres
  [{:name "angry_birds", :active true}]
  (let [details (tx/dbdef->connection-details :postgres :db {:database-name "dropped_views_test"})
        spec    (sql-jdbc.conn/connection-details->spec :postgres details)
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
  (ffirst (:rows (#'sql-jdbc.execute/run-query-with-timezone
                  :postgres
                  {:report-timezone report-timezone}
                  (sql-jdbc.conn/connection-details->spec :postgres (tx/dbdef->connection-details :postgres :server nil))
                  {:query "SELECT current_setting('TIMEZONE') AS timezone;"}))))

;; check that if we set report-timezone to US/Pacific that the session timezone is in fact US/Pacific
(datasets/expect-with-driver :postgres
  "US/Pacific"
  (get-timezone-with-report-timezone "US/Pacific"))

;; check that we can set it to something else: America/Chicago
(datasets/expect-with-driver :postgres
  "America/Chicago"
  (get-timezone-with-report-timezone "America/Chicago"))

;; ok, check that if we try to put in a fake timezone that the query still reëxecutes without a custom timezone. This
;; should give us the same result as if we didn't try to set a timezone at all
(datasets/expect-with-driver :postgres
  (get-timezone-with-report-timezone nil)
  (get-timezone-with-report-timezone "Crunk Burger"))


;; make sure connection details w/ extra params work as expected
(expect
  {:classname                     "org.postgresql.Driver"
   :subprotocol                   "postgresql"
   :subname                       "//localhost:5432/cool?prepareThreshold=0"
   :OpenSourceSubProtocolOverride true
   :sslmode                       "disable"}
  (sql-jdbc.conn/connection-details->spec :postgres
    {:host               "localhost"
     :port               "5432"
     :dbname             "cool"
     :additional-options "prepareThreshold=0"}))

(datasets/expect-with-driver :postgres
  "UTC"
  (tu/db-timezone-id))

;; Make sure we're able to fingerprint TIME fields (#5911)
(datasets/expect-with-driver :postgres
  #{#metabase.models.field.FieldInstance{:name "start_time", :fingerprint {:global {:distinct-count 1
                                                                                    :nil% 0.0}
                                                                           :type {:type/DateTime {:earliest "1970-01-01T22:00:00.000Z", :latest "1970-01-01T22:00:00.000Z"}}}}
    #metabase.models.field.FieldInstance{:name "end_time",   :fingerprint {:global {:distinct-count 1
                                                                                    :nil% 0.0}
                                                                           :type {:type/DateTime {:earliest "1970-01-01T09:00:00.000Z", :latest "1970-01-01T09:00:00.000Z"}}}}
    #metabase.models.field.FieldInstance{:name "reason",     :fingerprint {:global {:distinct-count 1
                                                                                    :nil% 0.0}
                                                                           :type   {:type/Text {:percent-json    0.0
                                                                                                :percent-url     0.0
                                                                                                :percent-email   0.0
                                                                                                :average-length 12.0}}}}}
  (do
    (drop-if-exists-and-create-db! "time_field_test")
    (let [details (tx/dbdef->connection-details :postgres :db {:database-name "time_field_test"})]
      (jdbc/execute! (sql-jdbc.conn/connection-details->spec :postgres details)
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

(defn- enums-test-db-details [] (tx/dbdef->connection-details :postgres :db {:database-name "enums_test"}))

(defn- create-enums-db!
  "Create a Postgres database called `enums_test` that has a couple of enum types and a couple columns of those types.
  One of those types has a space in the name, which is legal when quoted, to make sure we handle such wackiness
  properly."
  []
  (drop-if-exists-and-create-db! "enums_test")
  (jdbc/with-db-connection [conn (sql-jdbc.conn/connection-details->spec :postgres (enums-test-db-details))]
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
(datasets/expect-with-driver :postgres
  #{(keyword "bird type") :bird_status}
  (do-with-enums-db
    (fn [db]
      (#'postgres/enum-types :postgres db))))

;; check that describe-table properly describes the database & base types of the enum fields
(datasets/expect-with-driver :postgres
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
                       (driver/describe-table :postgres db {:name "birds"}))))

;; check that when syncing the DB the enum types get recorded appropriately
(datasets/expect-with-driver :postgres
  #{{:name "name",   :database_type "varchar",     :base_type :type/Text}
    {:name "type",   :database_type "bird type",   :base_type :type/PostgresEnum}
    {:name "status", :database_type "bird_status", :base_type :type/PostgresEnum}}
  (do-with-enums-db
    (fn [db]
      (let [table-id (db/select-one-id Table :db_id (u/get-id db), :name "birds")]
        (set (map (partial into {})
                  (db/select [Field :name :database_type :base_type] :table_id table-id)))))))


;; check that values for enum types get wrapped in appropriate CAST() fn calls in `->honeysql`
(datasets/expect-with-driver :postgres
  {:name :cast, :args ["toucan" (keyword "bird type")]}
  (sql.qp/->honeysql :postgres [:value "toucan" {:database_type "bird type", :base_type :type/PostgresEnum}]))

;; End-to-end check: make sure everything works as expected when we run an actual query
(datasets/expect-with-driver :postgres
  {:rows        [["Rasta" "good bird" "toucan"]]
   :native_form {:query  (str "SELECT \"public\".\"birds\".\"name\" AS \"name\","
                              " \"public\".\"birds\".\"status\" AS \"status\","
                              " \"public\".\"birds\".\"type\" AS \"type\" "
                              "FROM \"public\".\"birds\" "
                              "WHERE \"public\".\"birds\".\"type\" = CAST('toucan' AS \"bird type\") "
                              "LIMIT 10")
                 :params nil}}
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

;; make sure schema/table/field names with hyphens in them work correctly (#8766)
(datasets/expect-with-driver :postgres
  [["Bird Hat"]]
  (metabase.driver/with-driver :postgres
    [{:name "angry_birds", :active true}]
    (let [details (tx/dbdef->connection-details :postgres :db {:database-name "hyphen-names-test"})
          spec    (sql-jdbc.conn/connection-details->spec :postgres details)
          exec!   #(doseq [statement %]
                     (jdbc/execute! spec [statement]))]
      ;; create the postgres DB
      (drop-if-exists-and-create-db! "hyphen-names-test")
      ;; create the DB object
      (tt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "hyphen-names-test")}]
        (let [sync! #(sync/sync-database! database)]
          ;; populate the DB and create a view
          (exec! ["CREATE SCHEMA \"x-mas\";"
                  "CREATE TABLE \"x-mas\".\"presents-and-gifts\" (\"gift-description\" TEXT NOT NULL);"
                  "INSERT INTO \"x-mas\".\"presents-and-gifts\" (\"gift-description\") VALUES ('Bird Hat');;"])
          (sync!)
          (-> (qp/process-query
                {:database (u/get-id database)
                 :type     :query
                 :query    {:source-table (db/select-one-id Table :name "presents-and-gifts")}})
              rows))))))

;; If the DB throws an exception, is it properly returned by the query processor? Is it status :failed? (#9942)
(datasets/expect-with-driver :postgres
  {:status :failed
   :class  org.postgresql.util.PSQLException
   :error  "ERROR: column \"adsasdasd\" does not exist\n  Position: 20"}
  (-> (qp/process-query
        {:database (data/id)
         :type     :native
         :native   {:query "SELECT adsasdasd;"}})
      (select-keys [:status :class :error])))
