(ns metabase.driver.postgres-test
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer :all]
            [honeysql.core :as hsql]
            (metabase [db :as db]
                      [driver :as driver])
            [metabase.driver.generic-sql :as sql]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]])
            [metabase.query-processor.expand :as ql]
            [metabase.test.data :as data]
            (metabase.test.data [datasets :refer [expect-with-engine]]
                                [interface :as i])
            [metabase.test.util :as tu]
            [metabase.util :as u])
  (:import metabase.driver.postgres.PostgresDriver))

;; # Check that SSL params get added the connection details in the way we'd like
;; ## no SSL -- this should *not* include the key :ssl (regardless of its value) since that will cause the PG driver to use SSL anyway
(expect
  {:user        "camsaul"
   :classname   "org.postgresql.Driver"
   :subprotocol "postgresql"
   :subname     "//localhost:5432/bird_sightings"
   :make-pool?  true
   :sslmode     "disable"}
  (sql/connection-details->spec (PostgresDriver.) {:ssl    false
                                                   :host   "localhost"
                                                   :port   5432
                                                   :dbname "bird_sightings"
                                                   :user   "camsaul"}))

;; ## ssl - check that expected params get added
(expect
  {:ssl         true
   :make-pool?  true
   :sslmode     "require"
   :classname   "org.postgresql.Driver"
   :subprotocol "postgresql"
   :user        "camsaul"
   :sslfactory  "org.postgresql.ssl.NonValidatingFactory"
   :subname     "//localhost:5432/bird_sightings"}
  (sql/connection-details->spec (PostgresDriver.) {:ssl    true
                                                   :host   "localhost"
                                                   :port   5432
                                                   :dbname "bird_sightings"
                                                   :user   "camsaul"}))

;; Verify that we identify JSON columns and mark metadata properly during sync
(expect-with-engine :postgres
  :json
  (data/with-temp-db
    [_
     (i/create-database-definition "Postgres with a JSON Field"
       ["venues"
        [{:field-name "address", :base-type {:native "json"}}]
        [[(hsql/raw "to_json('{\"street\": \"431 Natoma\", \"city\": \"San Francisco\", \"state\": \"CA\", \"zip\": 94103}'::text)")]]])]
    (db/select-one-field :special_type Field, :id (data/id :venues :address))))


;;; # UUID Support
(i/def-database-definition ^:const ^:private with-uuid
  ["users"
   [{:field-name "user_id", :base-type :UUIDField}]
   [[#uuid "4f01dcfd-13f7-430c-8e6f-e505c0851027"]
    [#uuid "4652b2e7-d940-4d55-a971-7e484566663e"]
    [#uuid "da1d6ecc-e775-4008-b366-c38e7a2e8433"]
    [#uuid "7a5ce4a2-0958-46e7-9685-1a4eaa3bd08a"]
    [#uuid "84ed434e-80b4-41cf-9c88-e334427104ae"]]])


;; Check that we can load a Postgres Database with a :UUIDField
(expect-with-engine :postgres
  [{:name "id",      :base_type :IntegerField}
   {:name "user_id", :base_type :UUIDField}]
  (->> (data/dataset metabase.driver.postgres-test/with-uuid
         (data/run-query users))
       :data
       :cols
       (mapv (u/rpartial select-keys [:name :base_type]))))


;; Check that we can filter by a UUID Field
(expect-with-engine :postgres
  [[2 #uuid "4652b2e7-d940-4d55-a971-7e484566663e"]]
  (-> (data/dataset metabase.driver.postgres-test/with-uuid
        (data/run-query users
          (ql/filter (ql/= $user_id "4652b2e7-d940-4d55-a971-7e484566663e"))))
      :data :rows))


;;; # Make sure that Tables / Fields with dots in their names get escaped properly
(i/def-database-definition ^:const ^:private dots-in-names
  ["objects.stuff"
   [{:field-name "dotted.name", :base-type :TextField}]
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


;;; # Make sure that duplicate column names (e.g. caused by using a FK) still return both columns
(i/def-database-definition ^:const ^:private duplicate-names
  ["birds"
   [{:field-name "name", :base-type :TextField}]
   [["Rasta"]
    ["Lucky"]]]
  ["people"
   [{:field-name "name", :base-type :TextField}
    {:field-name "bird_id", :base-type :IntegerField, :fk :birds}]
   [["Cam" 1]]])

(expect-with-engine :postgres
  {:columns ["name" "name_2"]
   :rows    [["Cam" "Rasta"]]}
  (-> (data/dataset metabase.driver.postgres-test/duplicate-names
        (data/run-query people
          (ql/fields $name $bird_id->birds.name)))
      :data (dissoc :cols :native_form)))


;; Check that we properly fetch materialized views.
;; As discussed in #2355 they don't come back from JDBC `DatabaseMetadata` so we have to fetch them manually.
(expect-with-engine :postgres
  {:tables #{{:schema "public", :name "test_mview"}}}
  (let [driver (PostgresDriver.)]
    (jdbc/execute! (sql/connection-details->spec driver (i/database->connection-details driver :server nil))
                   ["DROP DATABASE IF EXISTS materialized_views_test;
                     CREATE DATABASE materialized_views_test;"]
                   :transaction? false)
    (let [details (i/database->connection-details driver :db {:database-name "materialized_views_test", :short-lived? true})]
      (jdbc/execute! (sql/connection-details->spec driver details)
                     ["DROP MATERIALIZED VIEW IF EXISTS test_mview;
                       CREATE MATERIALIZED VIEW test_mview AS
                       SELECT 'Toucans are the coolest type of bird.' AS true_facts;"])
      (tu/with-temp Database [database {:engine :postgres, :details (assoc details :dbname "materialized_views_test")}]
        (driver/describe-database driver database)))))
