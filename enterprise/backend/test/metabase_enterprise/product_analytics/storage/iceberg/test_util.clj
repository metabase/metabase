(ns metabase-enterprise.product-analytics.storage.iceberg.test-util
  "Shared helpers for Iceberg integration tests that run against the dev stack.
   Uses the dev JDBC catalog (Postgres on localhost:5434) with a local filesystem warehouse
   for data files, avoiding S3/Garage compatibility issues."
  (:require
   [metabase-enterprise.product-analytics.storage.iceberg.catalog :as iceberg.catalog]
   [metabase-enterprise.product-analytics.storage.iceberg.s3 :as iceberg.s3]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase-enterprise.product-analytics.storage.iceberg.writer :as writer]
   [metabase.util.log :as log])
  (:import
   (java.net Socket)
   (java.nio.file Files)
   (java.util HashMap)
   (org.apache.hadoop.conf Configuration)
   (org.apache.iceberg CatalogProperties Schema Table)
   (org.apache.iceberg.catalog Catalog Namespace SupportsNamespaces TableIdentifier)
   (org.apache.iceberg.data IcebergGenerics Record)
   (org.apache.iceberg.io CloseableIterable FileIO)
   (org.apache.iceberg.jdbc JdbcCatalog)
   (org.apache.iceberg.types Types$NestedField)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Infrastructure detection ------------------------------------------

(def ^:private catalog-host "localhost")
(def ^:private catalog-port 5434)
(def ^:private s3-host "localhost")
(def ^:private s3-port 3900)

(defn iceberg-dev-stack-available?
  "Check whether the dev Iceberg stack is reachable by probing the catalog Postgres port."
  []
  (try
    (with-open [_socket (Socket. ^String catalog-host (int catalog-port))]
      true)
    (catch Exception _
      false)))

(defn s3-available?
  "Check whether the dev S3-compatible service (Garage) is reachable."
  []
  (try
    (with-open [_socket (Socket. ^String s3-host (int s3-port))]
      true)
    (catch Exception _
      false)))

;;; ------------------------------------------------- Dynamic vars ---------------------------------------------------

(def ^:dynamic *test-catalog*
  "Bound to the test-specific Iceberg Catalog instance during integration tests."
  nil)

(def ^:dynamic *test-namespace*
  "Bound to a unique Iceberg Namespace for test isolation."
  nil)

(def ^:dynamic *test-warehouse-dir*
  "Bound to the temporary local directory used as the Iceberg warehouse for test data files."
  nil)

;;; --------------------------------------------------- Helpers ------------------------------------------------------

(defn unique-test-namespace
  "Generate a unique Iceberg Namespace for test isolation, e.g. `pa_test_a1b2c3d4`."
  ^Namespace []
  (let [suffix (subs (str (java.util.UUID/randomUUID)) 0 8)]
    (Namespace/of (into-array String [(str "pa_test_" suffix)]))))

(defn create-test-catalog
  "Create a JDBC-backed Iceberg catalog using a local filesystem warehouse.
   Uses the dev Postgres catalog but writes data files to a temp directory,
   avoiding S3/Garage chunked-encoding signature issues."
  ^Catalog [^String warehouse-path]
  (let [jdbc-uri  (iceberg.settings/product-analytics-iceberg-catalog-uri)
        jdbc-user (iceberg.settings/product-analytics-iceberg-catalog-user)
        jdbc-pass (iceberg.settings/product-analytics-iceberg-catalog-password)
        props     (doto (HashMap.)
                    (.put CatalogProperties/URI jdbc-uri)
                    (.put CatalogProperties/WAREHOUSE_LOCATION warehouse-path))
        _         (when jdbc-user (.put props "jdbc.user" jdbc-user))
        _         (when jdbc-pass (.put props "jdbc.password" jdbc-pass))
        catalog   (JdbcCatalog.)]
    (.setConf catalog (Configuration.))
    (.initialize catalog "pa_integration_test" props)
    catalog))

(defn test-table-id
  "Return a TableIdentifier for `table-name` within `*test-namespace*`."
  ^TableIdentifier [^String table-name]
  (TableIdentifier/of ^Namespace *test-namespace* table-name))

(defn drop-test-tables!
  "Drop all tables in the test namespace, then drop the namespace itself."
  [^Catalog catalog ^Namespace ns]
  (doseq [^TableIdentifier tid (.listTables catalog ns)]
    (try
      (.dropTable catalog tid true)
      (catch Exception e
        (log/warnf e "Failed to drop table %s during cleanup" tid))))
  (try
    (.dropNamespace ^SupportsNamespaces catalog ns)
    (catch Exception e
      (log/warnf e "Failed to drop namespace %s during cleanup" ns))))

(defn- delete-dir-recursively!
  "Recursively delete a directory and its contents."
  [^java.io.File dir]
  (when (.exists dir)
    (doseq [^java.io.File f (reverse (file-seq dir))]
      (.delete f))))

;;; -------------------------------------------- S3-backed catalog ---------------------------------------------------

(defn create-test-catalog-with-s3
  "Create a JDBC-backed Iceberg catalog using the real S3 warehouse from settings.
   The catalog's S3FileIO client is patched to disable chunked encoding so it works
   with S3-compatible services like Garage."
  ^Catalog []
  (let [jdbc-uri  (iceberg.settings/product-analytics-iceberg-catalog-uri)
        jdbc-user (iceberg.settings/product-analytics-iceberg-catalog-user)
        jdbc-pass (iceberg.settings/product-analytics-iceberg-catalog-password)
        bucket    (iceberg.settings/product-analytics-iceberg-s3-bucket)
        prefix    (iceberg.settings/product-analytics-iceberg-s3-prefix)
        warehouse (str "s3://" bucket "/" prefix)
        props     (doto (HashMap.)
                    (.put CatalogProperties/URI jdbc-uri)
                    (.put CatalogProperties/WAREHOUSE_LOCATION warehouse)
                    (.putAll (iceberg.s3/s3-file-io-properties)))
        _         (when jdbc-user (.put props "jdbc.user" jdbc-user))
        _         (when jdbc-pass (.put props "jdbc.password" jdbc-pass))
        catalog   (JdbcCatalog.)]
    (.setConf catalog (Configuration.))
    (.initialize catalog "pa_s3_integration_test" props)
    ;; Patch S3FileIO's internal client to disable chunked encoding
    (let [io-field (doto (.getDeclaredField JdbcCatalog "io")
                     (.setAccessible true))
          ^FileIO file-io (.get io-field catalog)]
      (iceberg.s3/patch-file-io-s3-client! file-io))
    catalog))

;;; --------------------------------------------------- Fixtures -----------------------------------------------------

(defn with-iceberg-s3-test-ns
  "`:once` fixture: like [[with-iceberg-test-ns]] but uses the real S3 warehouse for data files.
   Requires both the catalog Postgres and S3 (Garage) to be available."
  [thunk]
  (cond
    (not (iceberg-dev-stack-available?))
    (log/infof "Skipping S3 integration tests: catalog not available (%s:%d unreachable)"
               catalog-host catalog-port)

    (not (s3-available?))
    (log/infof "Skipping S3 integration tests: S3 not available (%s:%d unreachable)"
               s3-host s3-port)

    :else
    (let [catalog (create-test-catalog-with-s3)
          ns      (unique-test-namespace)]
      (try
        (.createNamespace ^SupportsNamespaces catalog ns (HashMap.))
        (log/infof "Created S3 test namespace %s" ns)
        (binding [*test-catalog*   catalog
                  *test-namespace* ns]
          (with-redefs [writer/pa-namespace    ns
                        iceberg.catalog/catalog (fn [] catalog)]
            (thunk)))
        (finally
          (drop-test-tables! catalog ns))))))

(defn with-iceberg-test-ns
  "`:once` fixture: checks dev stack availability, creates an isolated test catalog and namespace
   with a local filesystem warehouse, binds dynamic vars, runs tests, and cleans up."
  [thunk]
  (if-not (iceberg-dev-stack-available?)
    (log/infof "Skipping Iceberg integration tests: dev stack not available (%s:%d unreachable)"
               catalog-host catalog-port)
    (let [tmp-dir  (str (Files/createTempDirectory "iceberg-test" (into-array java.nio.file.attribute.FileAttribute [])))
          catalog  (create-test-catalog tmp-dir)
          ns       (unique-test-namespace)]
      (try
        (.createNamespace ^SupportsNamespaces catalog ns (HashMap.))
        (log/infof "Created test namespace %s with warehouse %s" ns tmp-dir)
        (binding [*test-catalog*      catalog
                  *test-namespace*    ns
                  *test-warehouse-dir* tmp-dir]
          (with-redefs [writer/pa-namespace    ns
                        iceberg.catalog/catalog (fn [] catalog)
                        ;; Local filesystem warehouse has no S3, use native FileIO path
                        iceberg.settings/product-analytics-iceberg-s3-staging-uploads (constantly false)]
            (thunk)))
        (finally
          (drop-test-tables! catalog ns)
          (delete-dir-recursively! (java.io.File. ^String tmp-dir)))))))

;;; ------------------------------------------------- Read helpers ---------------------------------------------------

(defn- record->map
  "Convert an Iceberg Record to a Clojure map using the table schema."
  [^Schema schema ^Record record]
  (into {}
        (map (fn [^Types$NestedField field]
               (let [field-name (.name field)]
                 [(keyword field-name) (.getField record field-name)])))
        (.columns schema)))

(defn read-all-records
  "Read all records from an Iceberg table and return them as a vector of Clojure maps."
  [^Table table]
  (let [schema (.schema table)]
    (with-open [^CloseableIterable iterable (.build (IcebergGenerics/read table))]
      (into [] (map #(record->map schema %)) (iterator-seq (.iterator iterable))))))
