(ns metabase-enterprise.checker.format.concise-test
  "Tests for the concise JSON schema format — single file with three flat lists."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.checker.format.concise :as concise]
   [metabase-enterprise.checker.source :as source]))

(set! *warn-on-reflection* true)

(def ^:private fixture-file "test_resources/yaml_checks/concise_metadata.json")

(defn- fixture-path []
  (let [f (io/file fixture-file)]
    (if (.isAbsolute f)
      fixture-file
      (.getPath (io/file (System/getProperty "user.dir") fixture-file)))))

;;; ===========================================================================
;;; Database resolution
;;; ===========================================================================

(deftest resolve-database-test
  (let [source (concise/make-source (fixture-path))]
    (testing "resolves known database"
      (let [db (source/resolve-database source "Test Database")]
        (is (some? db))
        (is (= "Test Database" (:name db)))
        (is (= "h2" (:engine db)))))
    (testing "returns nil for unknown database"
      (is (nil? (source/resolve-database source "Nonexistent"))))))

(deftest all-database-names-test
  (let [source (concise/make-source (fixture-path))]
    (is (= #{"Test Database" "SQLite DB"}
           (set (source/all-database-names source))))))

;;; ===========================================================================
;;; Table resolution
;;; ===========================================================================

(deftest resolve-table-test
  (let [source (concise/make-source (fixture-path))]
    (testing "resolves table with schema"
      (let [table (source/resolve-table source ["Test Database" "public" "orders"])]
        (is (some? table))
        (is (= "orders" (:name table)))
        (is (= "public" (:schema table)))))
    (testing "resolves schema-less table"
      (let [table (source/resolve-table source ["SQLite DB" nil "orders"])]
        (is (some? table))
        (is (= "orders" (:name table)))))
    (testing "returns nil for unknown table"
      (is (nil? (source/resolve-table source ["Test Database" "public" "nope"]))))))

(deftest all-table-paths-test
  (let [source (concise/make-source (fixture-path))
        tables (source/all-table-paths source)]
    (is (= 4 (count tables)))
    (is (some #(= ["Test Database" "public" "orders"] %) tables))
    (is (some #(= ["Test Database" "public" "products"] %) tables))
    (is (some #(= ["SQLite DB" nil "orders"] %) tables))
    (is (some #(= ["SQLite DB" nil "users"] %) tables))))

(deftest tables-for-database-test
  (let [source (concise/make-source (fixture-path))]
    (is (= 2 (count (source/tables-for-database source "Test Database"))))
    (is (= 2 (count (source/tables-for-database source "SQLite DB"))))))

;;; ===========================================================================
;;; Field resolution
;;; ===========================================================================

(deftest resolve-field-test
  (let [source (concise/make-source (fixture-path))]
    (testing "resolves field with schema"
      (let [field (source/resolve-field source ["Test Database" "public" "orders" "total"])]
        (is (some? field))
        (is (= "total" (:name field)))
        (is (= "type/Float" (:base_type field)))
        (is (= "DOUBLE PRECISION" (:database_type field)))))
    (testing "resolves schema-less field"
      (let [field (source/resolve-field source ["SQLite DB" nil "orders" "id"])]
        (is (some? field))
        (is (= "id" (:name field)))))
    (testing "returns nil for unknown field"
      (is (nil? (source/resolve-field source ["Test Database" "public" "orders" "nope"]))))))

(deftest fields-for-table-test
  (let [source (concise/make-source (fixture-path))]
    (testing "returns field paths for table"
      (let [fields (source/fields-for-table source ["Test Database" "public" "orders"])]
        (is (set? fields))
        (is (= 4 (count fields)))
        (is (contains? fields ["Test Database" "public" "orders" "id"]))
        (is (contains? fields ["Test Database" "public" "orders" "total"]))))
    (testing "returns nil for unknown table"
      (is (nil? (source/fields-for-table source ["Nope" "x" "y"]))))))

(deftest all-field-paths-test
  (let [source (concise/make-source (fixture-path))]
    (is (= 11 (count (source/all-field-paths source))))))

;;; ===========================================================================
;;; Data shape — returned maps have keys the provider expects
;;; ===========================================================================

(deftest table-has-schema-and-db-id-test
  (testing "table data includes :schema and :db_id for provider"
    (let [source (concise/make-source (fixture-path))
          table  (source/resolve-table source ["Test Database" "public" "orders"])]
      (is (= "public" (:schema table)))
      (is (= "Test Database" (:db_id table))))))

(deftest field-has-table-id-test
  (testing "field data includes :table_id as path vector for provider"
    (let [source (concise/make-source (fixture-path))
          field  (source/resolve-field source ["Test Database" "public" "orders" "total"])]
      (is (= ["Test Database" "public" "orders"] (:table_id field))))))
