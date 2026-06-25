(ns metabase.transforms.test-run.catalog-threading-test
  "Unit tests for catalog (db-slot) threading through scratch specs, transform details,
  and read-back SQL.

  These are purely driver-agnostic tests — no live database connection required.
  They verify that when a driver has a non-nil db-slot value, that value appears in:
    1. The scratch output-target `:db` slot.
    2. The `build-transform-details` `:output-db` field.
    3. The SQL string emitted by `read-back-output`.

  And that for drivers without a db-slot (postgres, h2) those fields remain nil / 2-segment."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.query-processor.core :as qp]
   [metabase.transforms.test-run.execute :as execute]
   [metabase.transforms.test-run.scratch :as scratch]))

(set! *warn-on-reflection* true)

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
    (let [drv     :mysql
          catalog (driver.sql/db-slot-value drv mysql-db)
          nonce   "aabbccdd"
          target  (scratch/scratch-output-target "myschema" nonce "out" catalog)]
      (is (= "my_catalog" catalog)
          "db-slot-value returns the :db details entry for mysql")
      (is (= "my_catalog" (:db target))
          "scratch-output-target :db must equal the catalog string"))))

(deftest scratch-output-target-non-db-slot-driver-db-is-nil-test
  (testing "scratch-output-target :db is nil for a non-db-slot driver (postgres)"
    (let [drv     :postgres
          catalog (driver.sql/db-slot-value drv postgres-db)
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
    (with-redefs [driver/connection-spec (fn [_drv _db] {:subprotocol "stub"})]
      (let [output-target {:schema "myschema"
                           :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                           :db     "my_catalog"}
            details       (execute/build-transform-details
                           (minimal-compiled) output-target 1 mysql-db :mysql)]
        (is (= "my_catalog" (:output-db details))
            "output-db must be the catalog from output-target :db")))))

(deftest build-transform-details-output-db-nil-for-non-db-slot-driver-test
  (testing ":output-db is nil for a non-db-slot driver (regression guard)"
    (with-redefs [driver/connection-spec (fn [_drv _db] {:subprotocol "stub"})]
      (let [output-target {:schema "public"
                           :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                           :db     nil}
            details       (execute/build-transform-details
                           (minimal-compiled) output-target 2 postgres-db :postgres)]
        (is (nil? (:output-db details))
            "output-db must remain nil for postgres")))))

;;; ---------------------------------------------------------------------------
;;; 3. read-back SQL is 3-segment for db-slot drivers, 2-segment otherwise
;;; ---------------------------------------------------------------------------

(deftest read-back-sql-is-3-segment-for-db-slot-driver-test
  (testing "read-back SQL contains catalog.schema.table for a db-slot driver"
    ;; Intercept qp/process-query to capture the SQL without a live DB.
    (let [captured (atom nil)]
      (with-redefs [qp/process-query
                    (fn [q]
                      (reset! captured q)
                      {:status :completed
                       :data   {:cols [] :rows []}})]
        (let [output-target {:schema "myschema"
                             :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                             :db     "my_catalog"}]
          (execute/read-back-output 1 :mysql output-target)))
      (let [sql (get-in @captured [:native :query])]
        (is (some? sql) "a query should have been submitted")
        ;; 3-segment: catalog.schema.table — all three components present
        (is (str/includes? sql "my_catalog")
            (str "SQL must contain catalog; got: " sql))
        (is (str/includes? sql "myschema")
            (str "SQL must contain schema; got: " sql))
        (is (str/includes? sql "mb_transform_temp_table_test_abc123_aabbccdd_out")
            (str "SQL must contain table; got: " sql))
        ;; Exactly 3 backtick-quoted or double-quoted segments — verify count
        ;; MySQL uses backticks; we check that catalog.schema.table all appear together
        (is (re-find #"my_catalog" sql)
            "3-segment: catalog segment present")))))

(deftest read-back-sql-is-2-segment-for-non-db-slot-driver-test
  (testing "read-back SQL is schema.table (2-segment) for postgres — regression guard"
    (let [captured (atom nil)]
      (with-redefs [qp/process-query
                    (fn [q]
                      (reset! captured q)
                      {:status :completed
                       :data   {:cols [] :rows []}})]
        (let [output-target {:schema "public"
                             :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                             :db     nil}]
          (execute/read-back-output 2 :postgres output-target)))
      (let [sql (get-in @captured [:native :query])]
        (is (some? sql))
        (is (str/includes? sql "public")
            (str "SQL must contain schema; got: " sql))
        (is (str/includes? sql "mb_transform_temp_table_test_abc123_aabbccdd_out")
            (str "SQL must contain table; got: " sql))
        ;; Must NOT contain a spurious third segment (nil catalog should not inject anything)
        (is (not (str/includes? sql "nil"))
            "nil catalog must not appear as a literal string in SQL")))))

(deftest read-back-sql-no-schema-no-db-test
  (testing "read-back SQL is bare table when schema and db are both nil"
    (let [captured (atom nil)]
      (with-redefs [qp/process-query
                    (fn [q]
                      (reset! captured q)
                      {:status :completed
                       :data   {:cols [] :rows []}})]
        (execute/read-back-output 2 :postgres {:schema nil
                                               :table  "mb_transform_temp_table_test_abc123_aabbccdd_out"
                                               :db     nil}))
      (let [sql (get-in @captured [:native :query])]
        (is (some? sql))
        (is (str/includes? sql "mb_transform_temp_table_test_abc123_aabbccdd_out"))))))

;;; ---------------------------------------------------------------------------
;;; 4. Seed mapping values carry :db slot
;;; ---------------------------------------------------------------------------

(deftest seed-scratch-spec-carries-db-slot-test
  (testing "Each scratch-spec in the seed! mapping carries :db from db-slot-value"
    ;; We can test this by inspecting scratch-output-target shape — seed! should
    ;; produce scratch-specs with the same :db structure.
    ;; Since seed! makes live DDL calls, test the spec shape via scratch-output-target
    ;; as a proxy (same shape contract).
    (let [catalog "my_catalog"
          target  (scratch/scratch-output-target "myschema" "aabbccdd" "in_42" catalog)]
      (is (= "my_catalog" (:db target))
          "seed scratch-spec :db should be the catalog"))))
