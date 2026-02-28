(ns metabase-enterprise.product-analytics.storage.iceberg.catalog
  "Iceberg Catalog factory — dispatches on catalog type setting to build the appropriate catalog."
  (:require
   [metabase-enterprise.product-analytics.storage.iceberg.s3 :as iceberg.s3]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log])
  (:import
   (java.util HashMap)
   (org.apache.hadoop.conf Configuration)
   (org.apache.iceberg CatalogProperties)
   (org.apache.iceberg.catalog Catalog)
   (org.apache.iceberg.io FileIO)
   (org.apache.iceberg.jdbc JdbcCatalog)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- Catalog multimethod ------------------------------------------------

(defmulti create-catalog*
  "Build an Iceberg Catalog instance for the given catalog type keyword.
   Dispatches on the first argument (the catalog type)."
  (fn [catalog-type _opts] catalog-type))

(defmethod create-catalog* :default
  [catalog-type _opts]
  (throw (ex-info (tru "Iceberg catalog type {0} is not yet implemented." (pr-str catalog-type))
                  {:catalog-type catalog-type
                   :available    #{:jdbc}})))

(defn- patch-catalog-file-io!
  "Patch the catalog's S3FileIO client if path-style access is enabled (S3-compatible service).
   Must be called after catalog initialization and before any table operations."
  [^JdbcCatalog catalog]
  (when (iceberg.settings/product-analytics-iceberg-s3-path-style-access)
    (let [io-field (doto (.getDeclaredField JdbcCatalog "io")
                     (.setAccessible true))
          ^FileIO file-io (.get io-field catalog)]
      (iceberg.s3/patch-file-io-s3-client! file-io))))

(defmethod create-catalog* :jdbc
  [_catalog-type {:keys [^String warehouse-uri]}]
  (let [jdbc-uri  (iceberg.settings/product-analytics-iceberg-catalog-uri)
        jdbc-user (iceberg.settings/product-analytics-iceberg-catalog-user)
        jdbc-pass (iceberg.settings/product-analytics-iceberg-catalog-password)
        props     (doto (HashMap.)
                    (.put CatalogProperties/URI jdbc-uri)
                    (.put CatalogProperties/WAREHOUSE_LOCATION warehouse-uri)
                    (.putAll (iceberg.s3/s3-file-io-properties)))
        _         (when jdbc-user (.put props "jdbc.user" jdbc-user))
        _         (when jdbc-pass (.put props "jdbc.password" jdbc-pass))
        catalog   (JdbcCatalog.)]
    (.setConf catalog (Configuration.))
    (.initialize catalog "product_analytics" props)
    (patch-catalog-file-io! catalog)
    (log/infof "Initialized JDBC Iceberg catalog (uri=%s, warehouse=%s)" jdbc-uri warehouse-uri)
    catalog))

;;; -------------------------------------------- Cached catalog access ---------------------------------------------

(def ^:private catalog-atom (atom nil))

(defn- warehouse-uri
  "Construct the S3 warehouse URI from settings."
  []
  (let [bucket (iceberg.settings/product-analytics-iceberg-s3-bucket)
        prefix (iceberg.settings/product-analytics-iceberg-s3-prefix)]
    (str "s3://" bucket "/" prefix)))

(defn catalog
  "Return the cached Iceberg Catalog, creating it if necessary."
  ^Catalog []
  (or @catalog-atom
      (let [catalog-type (keyword (iceberg.settings/product-analytics-iceberg-catalog-type))
            cat          (create-catalog* catalog-type {:warehouse-uri (warehouse-uri)})]
        (reset! catalog-atom cat)
        cat)))

(defn reset-catalog!
  "Reset the cached catalog (e.g. when settings change). Next call to [[catalog]] will create a new one."
  []
  (reset! catalog-atom nil))
