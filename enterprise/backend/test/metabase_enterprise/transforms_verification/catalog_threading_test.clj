(ns metabase-enterprise.transforms-verification.catalog-threading-test
  "Unit tests for catalog (db-slot) threading through scratch specs, transform details,
  and read-back SQL.

  These tests require no live warehouse connection — QP execution is stubbed;
  the read-back tests create temp app-DB Database rows so query construction has
  real database metadata. They verify that when a driver has a non-nil db-slot
  value, that value appears in:
    1. The scratch output-target `:db` slot.
    2. The `build-transform-details` `:output-db` field.
    3. The SQL reference rendered by `scratch/spec->sql-ref` (and therefore in
       `read-back-output`'s SELECT).

  And that for drivers without a db-slot (postgres, h2) those fields remain nil / 2-segment."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-verification.execute :as execute]
   [metabase-enterprise.transforms-verification.scratch :as scratch]
   [metabase.driver :as driver]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql :as driver.sql]
   [metabase.lib.core :as lib]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]))

(set! *warn-on-reflection* true)

;; The :mysql methods of db-slot-value / quote-name must be registered for these
;; driver-agnostic tests; nothing else here loads the driver. (mt/test-drivers
;; would be wrong — it skips unless DRIVERS includes mysql, and no live
;; connection is needed.)
(use-fixtures :once (fn [thunk]
                      (driver/the-initialized-driver :mysql)
                      (thunk)))

;;; ---------------------------------------------------------------------------
;;; Fixtures: synthetic db rows
;;; ---------------------------------------------------------------------------

(def ^:private mysql-db
  "Synthetic :model/Database row for a db-slot driver (mysql uses :db in details)."
  {:id      1
   :engine  "mysql"
   :details {:db "my_catalog" :host "localhost"}})

(def ^:private postgres-db
  "Synthetic :model/Database row for a non-db-slot driver."
  {:id      2
   :engine  "postgres"
   :details {:dbname "mydb" :host "localhost"}})

;;; ---------------------------------------------------------------------------
;;; Helper: build a minimal compiled-query map
;;; ---------------------------------------------------------------------------

(defn- minimal-compiled []
  {:query "SELECT 1" :params []})

;;; ---------------------------------------------------------------------------
;;; 1. scratch-output-target includes :db for db-slot drivers
;;; ---------------------------------------------------------------------------

(deftest scratch-output-target-db-slot-driver-carries-catalog-test
  (testing "scratch-output-target :db is the catalog string for a db-slot driver (mysql)"
    (let [driver  :mysql
          catalog (driver.sql/db-slot-value driver mysql-db)
          nonce   "aabbccdd"
          target  (scratch/scratch-output-target "myschema" nonce "out" catalog)]
      (is (= "my_catalog" catalog)
          "db-slot-value returns the :db details entry for mysql")
      (is (= "my_catalog" (:db target))
          "scratch-output-target :db must equal the catalog string"))))

(deftest scratch-output-target-non-db-slot-driver-db-is-nil-test
  (testing "scratch-output-target :db is nil for a non-db-slot driver (postgres)"
    (let [driver  :postgres
          catalog (driver.sql/db-slot-value driver postgres-db)
          nonce   "aabbccdd"
          target  (scratch/scratch-output-target "public" nonce "out" catalog)]
      (is (nil? catalog)
          "db-slot-value returns nil for postgres")
      (is (nil? (:db target))
          "scratch-output-target :db must be nil for postgres"))))

(deftest scratch-output-target-schema-and-table-unaffected-test
  (testing ":schema and :table slots are unaffected by catalog threading"
    (let [nonce  "deadbeef"
          target (scratch/scratch-output-target "public" nonce "out" "some_catalog")]
      (is (= "public" (:schema target)))
      (is (scratch/test-table-name? (:table target))))))

;;; ---------------------------------------------------------------------------
;;; 2. build-transform-details :output-db is set from output-target :db
;;; ---------------------------------------------------------------------------

(deftest build-transform-details-output-db-set-for-db-slot-driver-test
  (testing ":output-db in transform details equals :db from output-target for a db-slot driver"
    ;; Stub connection-spec so build-transform-details doesn't hit the real app DB.
    (with-redefs [driver/connection-spec (fn [_driver _db] {:subprotocol "stub"})]
      (let [output-target {:schema "myschema"
                           :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                           :db     "my_catalog"}
            details       (execute/build-transform-details
                           (minimal-compiled) output-target 1 mysql-db :mysql)]
        (is (= "my_catalog" (:output-db details))
            "output-db must be the catalog from output-target :db")))))

(deftest build-transform-details-output-db-nil-for-non-db-slot-driver-test
  (testing ":output-db is nil for a non-db-slot driver"
    (with-redefs [driver/connection-spec (fn [_driver _db] {:subprotocol "stub"})]
      (let [output-target {:schema "public"
                           :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                           :db     nil}
            details       (execute/build-transform-details
                           (minimal-compiled) output-target 2 postgres-db :postgres)]
        (is (nil? (:output-db details))
            "output-db must remain nil for postgres")))))

;;; ---------------------------------------------------------------------------
;;; 3. spec->sql-ref renders a scratch spec with driver quoting
;;; ---------------------------------------------------------------------------

(deftest spec->sql-ref-test
  (testing "3-segment catalog.schema.table with driver quoting for a db-slot driver"
    (is (= "`my_catalog`.`myschema`.`tbl`"
           (scratch/spec->sql-ref :mysql {:db "my_catalog" :schema "myschema" :table "tbl"}))))
  (testing "2-segment schema.table when :db is nil"
    (is (= "\"public\".\"tbl\""
           (scratch/spec->sql-ref :postgres {:db nil :schema "public" :table "tbl"}))))
  (testing "bare table when schema and db are both nil"
    (is (= "\"tbl\""
           (scratch/spec->sql-ref :postgres {:db nil :schema nil :table "tbl"})))))

;;; ---------------------------------------------------------------------------
;;; 4. read-back SQL is 3-segment for db-slot drivers, 2-segment otherwise
;;; ---------------------------------------------------------------------------

(defn- captured-read-back-sql!
  "Run `read-back-output` for `output-target` against a temp Database of `engine`
  with QP execution stubbed; return the SQL string it submitted."
  [engine driver output-target]
  (let [captured (atom nil)]
    (mt/with-temp [:model/Database db {:engine engine}]
      (mt/with-dynamic-fn-redefs [qp/process-query
                                  (fn [q]
                                    (reset! captured q)
                                    {:status :completed
                                     :data   {:cols [] :rows []}})]
        (execute/read-back-output (:id db) driver output-target)))
    (lib/raw-native-query @captured)))

(deftest read-back-sql-is-3-segment-for-db-slot-driver-test
  (testing "read-back SQL contains catalog.schema.table for a db-slot driver"
    (is (= "SELECT * FROM `my_catalog`.`myschema`.`mb_transform_temp_table_test_abc123_aabbccdd_out`"
           (captured-read-back-sql! :mysql :mysql
                                    {:schema "myschema"
                                     :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                                     :db     "my_catalog"})))))

(deftest read-back-sql-is-2-segment-for-non-db-slot-driver-test
  (testing "read-back SQL is schema.table (2-segment) for postgres"
    (is (= "SELECT * FROM \"public\".\"mb_transform_temp_table_test_abc123_aabbccdd_out\""
           (captured-read-back-sql! :postgres :postgres
                                    {:schema "public"
                                     :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                                     :db     nil})))))

(deftest read-back-sql-no-schema-no-db-test
  (testing "read-back SQL is bare table when schema and db are both nil"
    (is (= "SELECT * FROM \"mb_transform_temp_table_test_abc123_aabbccdd_out\""
           (captured-read-back-sql! :postgres :postgres
                                    {:schema nil
                                     :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                                     :db     nil})))))

;;; ---------------------------------------------------------------------------
;;; 5. Seed mapping values carry :db slot
;;; ---------------------------------------------------------------------------

(deftest seed-scratch-spec-carries-db-slot-test
  (testing "Each scratch-spec in the seed! mapping carries :db from db-slot-value"
    ;; Stub the DDL seams — what's under test is seed!'s db-row → catalog → mapping
    ;; threading, not table creation.
    (with-redefs [driver/schema-exists?                       (fn [_driver _db-id _schema] true)
                  transforms-base.u/create-table-from-schema! (fn [_driver _db-id _schema] nil)
                  driver/insert-from-source!                  (fn [_driver _db-id _schema _source] nil)]
      (driver.conn/with-transform-connection
        (let [seed-inputs [{:table-info {:id 42 :schema "real_schema" :name "orders"
                                         :columns [{:name "id" :base-type :type/Integer :nullable? false}]}
                            :fixture    {:rows [[1]]}}
                           {:table-info {:id 43 :schema "real_schema" :name "people"
                                         :columns [{:name "id" :base-type :type/Integer :nullable? false}]}
                            :fixture    {:rows [[1]]}}]
              mapping     (scratch/seed! 1 mysql-db "myschema" seed-inputs "aabbccdd")]
          (is (= #{{:schema "real_schema" :table "orders"}
                   {:schema "real_schema" :table "people"}}
                 (set (keys mapping)))
              "mapping keys are the real-table specs")
          (is (every? #(= "my_catalog" (:db %)) (vals mapping))
              "every scratch-spec carries the mysql catalog in :db")
          (is (every? #(scratch/test-table-name? (:table %)) (vals mapping))
              "every scratch-spec table is a test scratch name"))))))
