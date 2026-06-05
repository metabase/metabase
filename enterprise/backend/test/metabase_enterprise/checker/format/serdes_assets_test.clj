(ns metabase-enterprise.checker.format.serdes-assets-test
  "Tests for the serdes assets format module — YAML extraction, file indexing, and assets source resolution."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.checker.format.serdes-assets :as serdes]
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

(deftest extract-entity-id-from-fixture-test
  (testing "extract-entity-id reads entity_id from a card YAML"
    (let [card-file (io/file (fixtures-path) "collections" "cards" "simple-orders_simple_orders.yaml")]
      (is (= "simple-orders" (serdes/extract-entity-id (.getPath card-file)))))))

(deftest extract-model-from-fixture-test
  (testing "extract-model reads the serdes model from a card YAML"
    (let [card-file (io/file (fixtures-path) "collections" "cards" "simple-orders_simple_orders.yaml")]
      (is (= "Card" (serdes/extract-model (.getPath card-file)))))))

(deftest extract-entity-id-from-temp-file-test
  (testing "extract-entity-id with various formats"
    (with-temp-dir
      (fn [dir]
        (let [f (write-yaml! dir "test.yaml" {:name "X" :entity_id "xYz123AbC"})]
          (is (= "xYz123AbC" (serdes/extract-entity-id f))))))))

;;; ===========================================================================
;;; Index tests — databases are indexed, tables/fields are on-demand
;;; ===========================================================================

(deftest build-file-index-databases-test
  (testing "build-file-index indexes databases from fixtures"
    (let [index (serdes/build-file-index (fixtures-path))]
      (is (contains? (:database index) "Test Database"))
      (is (contains? (:database index) "SQLite DB")))))

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
;;; AssetsSource protocol — resolution tests
;;; ===========================================================================

(deftest source-resolves-card-test
  (testing "SerdesSource resolves cards by entity-id"
    (let [source (serdes/make-source (fixtures-path))
          card   (source/resolve-card source "simple-orders")]
      (is (some? card))
      (is (= "Simple Orders" (:name card))))))

(deftest source-returns-nil-for-unknown-test
  (testing "SerdesSource returns nil for unknown entities"
    (let [source (serdes/make-source (fixtures-path))]
      (is (nil? (source/resolve-card source "no-such-card"))))))

;;; ===========================================================================
;;; Segments and measures — indexed from export dir
;;; ===========================================================================

(deftest export-dir-indexes-segments-and-measures-test
  (testing "build-file-index (export dir) finds segments and measures under databases/"
    (let [index (serdes/build-file-index (fixtures-path))]
      (is (contains? (:segment index) "big-orders-segment")
          "segment from with-schema table should be indexed")
      (is (contains? (:segment index) "recent-orders-segment")
          "segment from schema-less table should be indexed")
      (is (contains? (:measure index) "total-revenue-measure")
          "measure should be indexed"))))

(deftest segments-resolve-from-export-source-test
  (testing "segments can be resolved from the export source"
    (let [source (serdes/make-source (fixtures-path))]
      (let [seg (source/resolve-segment source "big-orders-segment")]
        (is (some? seg))
        (is (= "Big Orders" (:name seg))))
      (let [seg (source/resolve-segment source "recent-orders-segment")]
        (is (some? seg))
        (is (= "Recent Orders" (:name seg)))))))

(deftest measures-resolve-from-export-source-test
  (testing "measures can be resolved from the export source"
    (let [source (serdes/make-source (fixtures-path))
          m      (source/resolve-measure source "total-revenue-measure")]
      (is (some? m))
      (is (= "Total Revenue" (:name m))))))

;;; ===========================================================================
;;; Temp file edge cases
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
  (testing "source-index returns the assets index (no databases — those are in the schema source)"
    (let [source (serdes/make-source (fixtures-path))
          index  (serdes/source-index source)]
      (is (map? index))
      (is (not (contains? index :database)) "databases are in the schema source, not the assets index")
      (is (contains? index :card)))))

(deftest all-card-ids-test
  (testing "all-card-ids returns all card entity-ids"
    (let [source (serdes/make-source (fixtures-path))]
      (is (>= (count (serdes/all-card-ids source)) 5))
      (is (contains? (set (serdes/all-card-ids source)) "simple-orders")))))
