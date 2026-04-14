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
    (let [{:keys [index]} (serdes/build-file-index (fixtures-path))]
      (is (contains? (:database index) "Test Database"))
      (is (contains? (:database index) "SQLite DB")))))

(deftest build-file-index-cards-test
  (testing "build-file-index indexes cards by entity_id"
    (let [{:keys [index]} (serdes/build-file-index (fixtures-path))]
      (is (contains? (:card index) "simple-orders"))
      (is (contains? (:card index) "native-orders"))
      (is (contains? (:card index) "orders-with-products")))))

(deftest build-file-index-no-duplicates-test
  (testing "fixture index has no duplicates"
    (let [{:keys [index]} (serdes/build-file-index (fixtures-path))]
      (is (nil? (:duplicates index))))))

(deftest build-database-dir-index-test
  (testing "build-database-dir-index indexes databases and provides db-name->dir mapping"
    (let [db-dir (str (fixtures-path) "/databases")
          {:keys [index db-name->dir]} (serdes/build-database-dir-index db-dir)]
      (is (contains? (:database index) "Test Database"))
      (is (contains? (:database index) "SQLite DB"))
      (is (contains? db-name->dir "Test Database"))
      (is (contains? db-name->dir "SQLite DB"))
      ;; Tables are NOT in the index — they're resolved on demand
      (is (nil? (:table index)))
      ;; Should not contain cards (databases dir has no collections)
      (is (nil? (:card index))))))

;;; ===========================================================================
;;; db-name->dir mapping tests
;;; ===========================================================================

(deftest db-name-to-dir-mapping-test
  (testing "db-name->dir maps real database names to directory names"
    (with-temp-dir
      (fn [dir]
        ;; Create a database with a slugified directory name but real name in YAML
        (write-yaml! dir "databases" "my_fancy_db" "my_fancy_db.yaml"
                     {:name "My Fancy DB" :engine "h2"})
        (let [{:keys [db-name->dir]} (serdes/build-database-dir-index (str dir "/databases"))]
          (is (= "my_fancy_db" (get db-name->dir "My Fancy DB")))))))

  (testing "db-name->dir includes ALL databases, not just some"
    (with-temp-dir
      (fn [dir]
        (doseq [i (range 10)]
          (let [slug (str "db_" i)]
            (write-yaml! dir "databases" slug (str slug ".yaml")
                         {:name (str "Database " i) :engine "h2"})))
        (let [{:keys [db-name->dir]} (serdes/build-database-dir-index (str dir "/databases"))]
          (is (= 10 (count db-name->dir)))
          (doseq [i (range 10)]
            (is (= (str "db_" i) (get db-name->dir (str "Database " i))))))))))

;;; ===========================================================================
;;; SchemaSource protocol — on-demand resolution tests
;;; ===========================================================================

(deftest source-resolves-database-test
  (testing "SerdesSource resolves databases by name"
    (let [source (serdes/make-source (fixtures-path))
          db     (source/resolve-database source "Test Database")]
      (is (some? db))
      (is (= "Test Database" (:name db))))))

(deftest source-resolves-table-on-demand-test
  (testing "SerdesSource resolves tables by path on demand (no pre-indexing)"
    (let [source (serdes/make-source (fixtures-path))
          table  (source/resolve-table source ["Test Database" "public" "orders"])]
      (is (some? table))
      (is (= "orders" (:name table))))
    (testing "schema-less tables"
      (let [source (serdes/make-source (fixtures-path))
            table  (source/resolve-table source ["SQLite DB" nil "orders"])]
        (is (some? table))
        (is (= "orders" (:name table)))))))

(deftest source-resolves-field-on-demand-test
  (testing "SerdesSource resolves fields by path on demand"
    (let [source (serdes/make-source (fixtures-path))
          field  (source/resolve-field source ["Test Database" "public" "orders" "id"])]
      (is (some? field))
      (is (= "id" (:name field))))
    (testing "schema-less fields"
      (let [source (serdes/make-source (fixtures-path))
            field  (source/resolve-field source ["SQLite DB" nil "orders" "id"])]
        (is (some? field))
        (is (= "id" (:name field)))))))

(deftest source-resolves-card-test
  (testing "SerdesSource resolves cards by entity-id"
    (let [source (serdes/make-source (fixtures-path))
          card   (source/resolve-card source "simple-orders")]
      (is (some? card))
      (is (= "Simple Orders" (:name card))))))

(deftest source-returns-nil-for-unknown-test
  (testing "SerdesSource returns nil for unknown entities"
    (let [source (serdes/make-source (fixtures-path))]
      (is (nil? (source/resolve-database source "Nonexistent")))
      (is (nil? (source/resolve-table source ["DB" "x" "y"])))
      (is (nil? (source/resolve-field source ["DB" "x" "y" "z"])))
      (is (nil? (source/resolve-card source "no-such-card"))))))

;;; ===========================================================================
;;; fields-for-table and all-table-paths — on-demand enumeration
;;; ===========================================================================

(deftest fields-for-table-test
  (testing "fields-for-table returns field paths for a table"
    (let [source (serdes/make-source (fixtures-path))
          fields (source/fields-for-table source ["Test Database" "public" "orders"])]
      (is (set? fields))
      (is (contains? fields ["Test Database" "public" "orders" "id"]))
      (is (contains? fields ["Test Database" "public" "orders" "total"]))))
  (testing "fields-for-table works for schema-less tables"
    (let [source (serdes/make-source (fixtures-path))
          fields (source/fields-for-table source ["SQLite DB" nil "orders"])]
      (is (set? fields))
      (is (contains? fields ["SQLite DB" nil "orders" "id"]))))
  (testing "fields-for-table returns nil for unknown table"
    (let [source (serdes/make-source (fixtures-path))]
      (is (nil? (source/fields-for-table source ["Nope" "x" "y"]))))))

(deftest all-table-paths-test
  (testing "all-table-paths enumerates all tables across databases"
    (let [source (serdes/make-source (fixtures-path))
          tables (source/all-table-paths source)]
      (is (seq tables))
      (is (some #(= ["Test Database" "public" "orders"] %) tables))
      (is (some #(= ["SQLite DB" nil "orders"] %) tables)))))

(deftest all-database-names-test
  (testing "all-database-names returns database names"
    (let [source (serdes/make-source (fixtures-path))]
      (is (= #{"Test Database" "SQLite DB"} (set (source/all-database-names source)))))))

;;; ===========================================================================
;;; Slugified directory names — critical correctness tests
;;; ===========================================================================

(deftest slugified-db-dir-resolves-correctly-test
  (testing "databases with slugified directory names resolve correctly"
    (with-temp-dir
      (fn [dir]
        (let [db-dir (str dir "/databases")]
          ;; Create a database with slugified dir but real name in YAML
          (write-yaml! dir "databases" "analytics_data_warehouse" "analytics_data_warehouse.yaml"
                       {:name "Analytics Data Warehouse" :engine "postgres"})
          ;; Create a table under it
          (write-yaml! dir "databases" "analytics_data_warehouse" "schemas" "public" "tables" "orders" "orders.yaml"
                       {:name "orders" :schema "public"
                        :serdes/meta [{:id "Analytics Data Warehouse" :model "Database"}
                                      {:id "public" :model "Schema"}
                                      {:id "orders" :model "Table"}]})
          ;; Create a field
          (write-yaml! dir "databases" "analytics_data_warehouse" "schemas" "public" "tables" "orders" "fields" "id.yaml"
                       {:name "id" :base_type "type/Integer"
                        :serdes/meta [{:id "Analytics Data Warehouse" :model "Database"}
                                      {:id "public" :model "Schema"}
                                      {:id "orders" :model "Table"}
                                      {:id "id" :model "Field"}]})
          (let [source (serdes/make-database-source db-dir)]
            ;; Database resolves by real name
            (is (some? (source/resolve-database source "Analytics Data Warehouse")))
            ;; Table resolves using real db name
            (is (some? (source/resolve-table source ["Analytics Data Warehouse" "public" "orders"])))
            ;; Field resolves using real db name
            (let [field (source/resolve-field source ["Analytics Data Warehouse" "public" "orders" "id"])]
              (is (some? field))
              (is (= "id" (:name field))))
            ;; fields-for-table works
            (let [fields (source/fields-for-table source ["Analytics Data Warehouse" "public" "orders"])]
              (is (contains? fields ["Analytics Data Warehouse" "public" "orders" "id"])))))))))

;;; ===========================================================================
;;; Performance guards — indexing should NOT parse field/table YAMLs
;;; ===========================================================================

(deftest index-does-not-contain-tables-or-fields-test
  (testing "the file index only contains databases — tables and fields are resolved on demand"
    (let [db-dir (str (fixtures-path) "/databases")
          {:keys [index]} (serdes/build-database-dir-index db-dir)]
      (is (seq (:database index)) "databases should be in the index")
      (is (nil? (:table index)) "tables should NOT be in the index")
      (is (nil? (:field index)) "fields should NOT be in the index"))))

;;; ===========================================================================
;;; Segments and measures — indexed from export dir, NOT schema dir
;;; ===========================================================================

(deftest export-dir-indexes-segments-and-measures-test
  (testing "build-file-index (export dir) finds segments and measures under databases/"
    (let [{:keys [index]} (serdes/build-file-index (fixtures-path))]
      (is (contains? (:segment index) "big-orders-segment")
          "segment from with-schema table should be indexed")
      (is (contains? (:segment index) "recent-orders-segment")
          "segment from schema-less table should be indexed")
      (is (contains? (:measure index) "total-revenue-measure")
          "measure should be indexed"))))

(deftest schema-dir-does-not-index-segments-test
  (testing "build-database-dir-index (schema dir) does NOT index segments or measures"
    (let [db-dir (str (fixtures-path) "/databases")
          {:keys [index]} (serdes/build-database-dir-index db-dir)]
      (is (nil? (:segment index)) "schema dir should not contain segments")
      (is (nil? (:measure index)) "schema dir should not contain measures"))))

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
        (let [{:keys [index]} (serdes/build-file-index dir)]
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
          (let [{:keys [index]} (serdes/build-file-index dir)]
            (is (seq (:duplicates index)) "Should detect duplicate entity_ids")
            (is (= "dup-id" (:ref (first (:duplicates index)))))))))))

(deftest source-index-accessor-test
  (testing "source-index returns the index from a SerdesSource"
    (let [source (serdes/make-source (fixtures-path))
          index  (serdes/source-index source)]
      (is (map? index))
      (is (contains? index :database))
      (is (contains? index :card)))))

(deftest all-card-ids-test
  (testing "all-card-ids returns all card entity-ids"
    (let [source (serdes/make-source (fixtures-path))]
      (is (>= (count (serdes/all-card-ids source)) 5))
      (is (contains? (set (serdes/all-card-ids source)) "simple-orders")))))
