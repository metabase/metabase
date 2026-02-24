(ns metabase-enterprise.product-analytics.storage.iceberg.catalog
  "Iceberg Catalog factory — dispatches on catalog type setting to build the appropriate catalog."
  (:require
   [metabase-enterprise.product-analytics.storage.iceberg.s3 :as iceberg.s3]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log])
  (:import
   (java.util HashMap)
   (org.apache.hadoop.conf Configuration)
   (org.apache.iceberg CatalogProperties)
   (org.apache.iceberg.catalog Catalog)
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

(defmethod create-catalog* :jdbc
  [_catalog-type {:keys [^String warehouse-uri]}]
  (let [data-source (mdb.connection/data-source)
        props       (doto (HashMap.)
                      (.put CatalogProperties/WAREHOUSE_LOCATION warehouse-uri)
                      (.putAll (iceberg.s3/s3-file-io-properties)))
        catalog     (JdbcCatalog.)]
    ;; JdbcCatalog supports direct DataSource injection via the supplier overload
    (.setConf catalog (Configuration.))
    (.initialize catalog "product_analytics" props)
    (log/infof "Initialized JDBC Iceberg catalog with warehouse=%s" warehouse-uri)
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
