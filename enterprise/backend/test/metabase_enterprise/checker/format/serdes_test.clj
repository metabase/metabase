(ns metabase-enterprise.checker.format.serdes-test
  "Tests for the serdes format module — YAML extraction, file indexing, and source resolution."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.format.serdes :as serdes]
   [metabase-enterprise.checker.source :as source]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Helpers
;;; ===========================================================================

(def ^:private fixtures-dir "test_resources/yaml_checks")

(defn- fixtures-path []
  (let [f (io/file fixtures-dir)]
    (if (.isAbsolute f)
      fixtures-dir
      (.getPath (io/file (System/getProperty "user.dir") fixtures-dir)))))

(defn- with-temp-dir
  "Create a temp directory, call (f dir-path), then clean up."
  [f]
  (let [dir (java.io.File/createTempFile "serdes-test" "")]
    (.delete dir)
    (.mkdirs dir)
    (try
      (f (.getPath dir))
      (finally
        (doseq [fl (reverse (file-seq dir))]
          (.delete ^java.io.File fl))))))

(defn- write-yaml!
  "Write a YAML file, creating parent directories as needed."
  [dir & path-and-data]
  (let [data      (last path-and-data)
        path-segs (butlast path-and-data)
        ^java.io.File file (apply io/file dir (map str path-segs))]
    (.mkdirs (.getParentFile file))
    (spit file (yaml/generate-string data))
    (.getPath file)))

;;; ===========================================================================
;;; YAML extraction tests (pure, no files needed)
;;; ===========================================================================

(deftest extract-name-from-fixture-test
  (testing "extract-name reads the name field from a YAML file"
    (let [db-file (io/file (fixtures-path) "databases" "Test Database" "Test Database.yaml")]
      (is (= "Test Database" (serdes/extract-name (.getPath db-file)))))))

(deftest extract-entity-id-from-fixture-test
  (testing "extract-entity-id reads entity_id from a card YAML"
    (let [card-file (io/file (fixtures-path) "collections" "cards" "simple-orders_simple_orders.yaml")]
      (is (= "simple-orders" (serdes/extract-entity-id (.getPath card-file)))))))

(deftest extract-model-from-fixture-test
  (testing "extract-model reads the serdes model from a card YAML"
    (let [card-file (io/file (fixtures-path) "collections" "cards" "simple-orders_simple_orders.yaml")]
      (is (= "Card" (serdes/extract-model (.getPath card-file)))))))

(deftest extract-name-from-temp-file-test
  (testing "extract-name with various formats"
    (with-temp-dir
      (fn [dir]
        (let [f (write-yaml! dir "test.yaml" {:name "My Entity" :entity_id "abc"})]
          (is (= "My Entity" (serdes/extract-name f))))))))

(deftest extract-entity-id-from-temp-file-test
  (testing "extract-entity-id with various formats"
    (with-temp-dir
      (fn [dir]
        (let [f (write-yaml! dir "test.yaml" {:name "X" :entity_id "xYz123AbC"})]
          (is (= "xYz123AbC" (serdes/extract-entity-id f))))))))

;;; ===========================================================================
;;; build-file-index tests (using real fixtures)
;;; ===========================================================================

(deftest build-file-index-databases-test
  (testing "build-file-index indexes databases from fixtures"
    (let [index (serdes/build-file-index (fixtures-path))]
      (is (contains? (:database index) "Test Database"))
      (is (contains? (:database index) "SQLite DB")))))

(deftest build-file-index-tables-test
  (testing "build-file-index indexes tables with correct paths"
    (let [index (serdes/build-file-index (fixtures-path))]
      (is (contains? (:table index) ["Test Database" "public" "orders"]))
      (is (contains? (:table index) ["Test Database" "public" "products"]))
      ;; Schema-less tables have nil schema
      (is (contains? (:table index) ["SQLite DB" nil "orders"]))
      (is (contains? (:table index) ["SQLite DB" nil "users"])))))

(deftest build-file-index-fields-test
  (testing "build-file-index indexes fields"
    (let [index (serdes/build-file-index (fixtures-path))]
      (is (contains? (:field index) ["Test Database" "public" "orders" "id"]))
      (is (contains? (:field index) ["Test Database" "public" "orders" "total"]))
      ;; Schema-less fields
      (is (contains? (:field index) ["SQLite DB" nil "orders" "id"])))))

(deftest build-file-index-cards-test
  (testing "build-file-index indexes cards by entity_id"
    (let [index (serdes/build-file-index (fixtures-path))]
      (is (contains? (:card index) "simple-orders"))
      (is (contains? (:card index) "native-orders"))
      (is (contains? (:card index) "orders-with-products")))))

(deftest build-file-index-no-duplicates-test
  (testing "fixture index has no duplicates"
    (let [index (serdes/build-file-index (fixtures-path))]
      (is (nil? (:duplicates index))))))

;;; ===========================================================================
;;; build-database-dir-index tests
;;; ===========================================================================

(deftest build-database-dir-index-test
  (testing "build-database-dir-index indexes a databases directory"
    (let [db-dir (str (fixtures-path) "/databases")
          index  (serdes/build-database-dir-index db-dir)]
      (is (contains? (:database index) "Test Database"))
      (is (contains? (:database index) "SQLite DB"))
      (is (contains? (:table index) ["Test Database" "public" "orders"]))
      (is (contains? (:field index) ["Test Database" "public" "orders" "id"]))
      ;; Should not contain cards (databases dir has no collections)
      (is (nil? (:card index))))))

;;; ===========================================================================
;;; index-stats tests
;;; ===========================================================================

(deftest index-stats-test
  (testing "index-stats returns correct counts"
    (let [index (serdes/build-file-index (fixtures-path))
          stats (serdes/index-stats index)]
      (is (= 2 (:databases stats)))
      (is (pos? (:tables stats)))
      (is (pos? (:fields stats)))
      (is (pos? (:cards stats)))
      (is (= #{"Test Database" "SQLite DB"} (set (:database-names stats)))))))

;;; ===========================================================================
;;; SerdesSource resolution tests
;;; ===========================================================================

(deftest make-source-resolves-database-test
  (testing "SerdesSource resolves databases by name"
    (let [source (serdes/make-source (fixtures-path))]
      (let [db (source/resolve-database source "Test Database")]
        (is (some? db))
        (is (= "Test Database" (:name db)))))))

(deftest make-source-resolves-table-test
  (testing "SerdesSource resolves tables by path"
    (let [source (serdes/make-source (fixtures-path))]
      (let [table (source/resolve-table source ["Test Database" "public" "orders"])]
        (is (some? table))
        (is (= "orders" (:name table)))))))

(deftest make-source-resolves-field-test
  (testing "SerdesSource resolves fields by path"
    (let [source (serdes/make-source (fixtures-path))]
      (let [field (source/resolve-field source ["Test Database" "public" "orders" "id"])]
        (is (some? field))
        (is (= "id" (:name field)))))))

(deftest make-source-resolves-card-test
  (testing "SerdesSource resolves cards by entity-id"
    (let [source (serdes/make-source (fixtures-path))]
      (let [card (source/resolve-card source "simple-orders")]
        (is (some? card))
        (is (= "Simple Orders" (:name card)))))))

(deftest make-source-returns-nil-for-unknown-test
  (testing "SerdesSource returns nil for unknown entities"
    (let [source (serdes/make-source (fixtures-path))]
      (is (nil? (source/resolve-database source "Nonexistent")))
      (is (nil? (source/resolve-table source ["DB" "x" "y"])))
      (is (nil? (source/resolve-field source ["DB" "x" "y" "z"])))
      (is (nil? (source/resolve-card source "no-such-card"))))))

;;; ===========================================================================
;;; Enumeration tests
;;; ===========================================================================

(deftest all-card-ids-test
  (testing "all-card-ids returns all card entity-ids"
    (let [source (serdes/make-source (fixtures-path))]
      (is (>= (count (serdes/all-card-ids source)) 5))
      (is (contains? (set (serdes/all-card-ids source)) "simple-orders")))))

(deftest all-database-names-test
  (testing "all-database-names returns database names"
    (let [source (serdes/make-source (fixtures-path))]
      (is (= #{"Test Database" "SQLite DB"} (set (serdes/all-database-names source)))))))

;;; ===========================================================================
;;; Temp file index tests — edge cases
;;; ===========================================================================

(deftest build-file-index-empty-dir-test
  (testing "build-file-index on empty directory returns empty index"
    (with-temp-dir
      (fn [dir]
        (let [index (serdes/build-file-index dir)]
          (is (nil? (:database index)))
          (is (nil? (:card index))))))))

(def ^:private card-yaml-template
  "name: %s\nentity_id: %s\nserdes/meta:\n- id: %s\n  model: Card\n")

(deftest build-file-index-detects-duplicates-test
  (testing "build-file-index reports duplicate entity_ids"
    (with-temp-dir
      (fn [dir]
        ;; Create two cards with the same entity_id in different directories
        (let [^java.io.File f1 (io/file dir "collections" "a" "cards" "dup.yaml")
              ^java.io.File f2 (io/file dir "collections" "b" "cards" "dup.yaml")]
          (.mkdirs (.getParentFile f1))
          (.mkdirs (.getParentFile f2))
          (spit f1 (format card-yaml-template "Card A" "dup-id" "dup-id"))
          (spit f2 (format card-yaml-template "Card B" "dup-id" "dup-id"))
          (let [index (serdes/build-file-index dir)]
            (is (seq (:duplicates index)) "Should detect duplicate entity_ids")
            (is (= "dup-id" (:ref (first (:duplicates index)))))))))))

(deftest source-index-accessor-test
  (testing "source-index returns the index from a SerdesSource"
    (let [source (serdes/make-source (fixtures-path))
          index  (serdes/source-index source)]
      (is (map? index))
      (is (contains? index :database))
      (is (contains? index :card)))))

(deftest source-export-dir-accessor-test
  (testing "source-export-dir returns the export directory"
    (let [source (serdes/make-source (fixtures-path))]
      (is (= (fixtures-path) (serdes/source-export-dir source))))))
