(ns metabase-enterprise.checker.format.serdes-schema-test
  "Tests for the serdes schema format module — database/table/field resolution and lazy indexing."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.checker.format.serdes-schema :as serdes-schema]
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

(deftest build-database-dir-index-test
  (testing "build-database-dir-index indexes databases and provides db-name->dir mapping"
    (let [db-dir (str (fixtures-path) "/databases")
          {:keys [index db-name->dir]} (serdes-schema/build-database-dir-index db-dir)]
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
        (let [{:keys [db-name->dir]} (serdes-schema/build-database-dir-index (str dir "/databases"))]
          (is (= "my_fancy_db" (get db-name->dir "My Fancy DB")))))))

  (testing "db-name->dir includes ALL databases, not just some"
    (with-temp-dir
      (fn [dir]
        (doseq [i (range 10)]
          (let [slug (str "db_" i)]
            (write-yaml! dir "databases" slug (str slug ".yaml")
                         {:name (str "Database " i) :engine "h2"})))
        (let [{:keys [db-name->dir]} (serdes-schema/build-database-dir-index (str dir "/databases"))]
          (is (= 10 (count db-name->dir)))
          (doseq [i (range 10)]
            (is (= (str "db_" i) (get db-name->dir (str "Database " i))))))))))

;;; ===========================================================================
;;; SchemaSource protocol — on-demand resolution tests
;;; ===========================================================================

(deftest source-resolves-database-test
  (testing "SerdesSchemaSource resolves databases by name"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
          db     (source/resolve-database source "Test Database")]
      (is (some? db))
      (is (= "Test Database" (:name db))))))

(deftest source-resolves-table-on-demand-test
  (testing "SerdesSchemaSource resolves tables by path on demand (no pre-indexing)"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
          table  (source/resolve-table source ["Test Database" "public" "orders"])]
      (is (some? table))
      (is (= "orders" (:name table))))
    (testing "schema-less tables"
      (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
            table  (source/resolve-table source ["SQLite DB" nil "orders"])]
        (is (some? table))
        (is (= "orders" (:name table)))))))

(deftest source-resolves-field-on-demand-test
  (testing "SerdesSchemaSource resolves fields by path on demand"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
          field  (source/resolve-field source ["Test Database" "public" "orders" "id"])]
      (is (some? field))
      (is (= "id" (:name field))))
    (testing "schema-less fields"
      (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
            field  (source/resolve-field source ["SQLite DB" nil "orders" "id"])]
        (is (some? field))
        (is (= "id" (:name field)))))))

(deftest source-returns-nil-for-unknown-test
  (testing "SerdesSchemaSource returns nil for unknown entities"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))]
      (is (nil? (source/resolve-database source "Nonexistent")))
      (is (nil? (source/resolve-table source ["DB" "x" "y"])))
      (is (nil? (source/resolve-field source ["DB" "x" "y" "z"]))))))

;;; ===========================================================================
;;; fields-for-table and all-table-paths — on-demand enumeration
;;; ===========================================================================

(deftest fields-for-table-test
  (testing "fields-for-table returns field paths for a table"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
          fields (source/fields-for-table source ["Test Database" "public" "orders"])]
      (is (set? fields))
      (is (contains? fields ["Test Database" "public" "orders" "id"]))
      (is (contains? fields ["Test Database" "public" "orders" "total"]))))
  (testing "fields-for-table works for schema-less tables"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
          fields (source/fields-for-table source ["SQLite DB" nil "orders"])]
      (is (set? fields))
      (is (contains? fields ["SQLite DB" nil "orders" "id"]))))
  (testing "fields-for-table returns nil for unknown table"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))]
      (is (nil? (source/fields-for-table source ["Nope" "x" "y"]))))))

(deftest all-table-paths-test
  (testing "all-table-paths enumerates all tables across databases"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))
          tables (source/all-table-paths source)]
      (is (seq tables))
      (is (some #(= ["Test Database" "public" "orders"] %) tables))
      (is (some #(= ["SQLite DB" nil "orders"] %) tables)))))

(deftest all-database-names-test
  (testing "all-database-names returns database names"
    (let [source (serdes-schema/make-database-source (str (fixtures-path) "/databases"))]
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
          (let [source (serdes-schema/make-database-source db-dir)]
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
          {:keys [index]} (serdes-schema/build-database-dir-index db-dir)]
      (is (seq (:database index)) "databases should be in the index")
      (is (nil? (:table index)) "tables should NOT be in the index")
      (is (nil? (:field index)) "fields should NOT be in the index"))))

;;; ===========================================================================
;;; Cache shape and lazy resolution
;;; ===========================================================================

(def ^:private not-indexed ::serdes-schema/not-indexed)

(deftest schema-model-shape-test
  (testing "schema model starts with ::not-indexed for each schema, populates lazily"
    (with-temp-dir
      (fn [dir]
        (write-yaml! dir "databases" "db" "db.yaml" {:name "DB" :engine "h2"})
        (write-yaml! dir "databases" "db" "schemas" "s1" "tables" "t1" "t1.yaml"
                     {:name "T1" :schema "s1"})
        (write-yaml! dir "databases" "db" "schemas" "s1" "tables" "t1" "fields" "f1.yaml"
                     {:name "F1" :base_type "type/Integer"})
        (write-yaml! dir "databases" "db" "schemas" "s2" "tables" "t2" "t2.yaml"
                     {:name "T2" :schema "s2"})
        (write-yaml! dir "databases" "db" "schemas" "s2" "tables" "t2" "fields" "f2.yaml"
                     {:name "F2" :base_type "type/Text"})
        (let [source (serdes-schema/make-database-source (str dir "/databases"))]
          ;; Initial: db-file set, all schemas ::not-indexed
          (is (=? {"DB" {:db-file string?
                         :schemas {"s1" not-indexed
                                   "s2" not-indexed}}}
                  (serdes-schema/schema-model source)))
          ;; After resolving a table in s1: s1 indexed with tables, s2 untouched
          (source/resolve-table source ["DB" "s1" "T1"])
          (is (=? {"DB" {:schemas {"s1" {"T1" {:table-file string?
                                               :fields     not-indexed}}
                                   "s2" not-indexed}}}
                  (serdes-schema/schema-model source)))
          ;; After resolving fields for T1: T1 fields indexed, s2 still untouched
          (source/fields-for-table source ["DB" "s1" "T1"])
          (is (=? {"DB" {:schemas {"s1" {"T1" {:table-file string?
                                               :fields     {"F1" string?}}}
                                   "s2" not-indexed}}}
                  (serdes-schema/schema-model source))))))))

(deftest case-insensitive-schema-resolution-test
  (testing "schemas with different casing on disk vs YAML resolve correctly"
    (with-temp-dir
      (fn [dir]
        ;; Dir name is lowercase, YAML schema is uppercase (H2 convention)
        (write-yaml! dir "databases" "db" "db.yaml" {:name "DB" :engine "h2"})
        (write-yaml! dir "databases" "db" "schemas" "public" "tables" "orders" "orders.yaml"
                     {:name "ORDERS" :schema "PUBLIC"})
        (write-yaml! dir "databases" "db" "schemas" "public" "tables" "orders" "fields" "id.yaml"
                     {:name "ID" :base_type "type/Integer"})
        (let [source (serdes-schema/make-database-source (str dir "/databases"))]
          ;; Resolve by real names (uppercase) — schema re-keys from "public" to "PUBLIC"
          (is (some? (source/resolve-table source ["DB" "PUBLIC" "ORDERS"])))
          (is (some? (source/resolve-field source ["DB" "PUBLIC" "ORDERS" "ID"])))
          (is (=? {"DB" {:schemas {"PUBLIC" {"ORDERS" {:fields {"ID" string?}}}}}}
                  (serdes-schema/schema-model source))))))))
