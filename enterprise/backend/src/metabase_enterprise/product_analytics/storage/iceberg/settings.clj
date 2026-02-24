(ns metabase-enterprise.product-analytics.storage.iceberg.settings
  "Settings for the Iceberg storage backend for Product Analytics."
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(setting/defsetting product-analytics-iceberg-catalog-type
  (deferred-tru "Iceberg catalog type for Product Analytics storage.")
  :type       :string
  :visibility :admin
  :default    "jdbc"
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-catalog-uri
  (deferred-tru "URI for the Iceberg catalog (REST or Glue endpoint).")
  :type       :string
  :visibility :admin
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-s3-bucket
  (deferred-tru "S3 bucket for Iceberg data files.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "metabase-product-analytics")
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-s3-prefix
  (deferred-tru "S3 key prefix for Iceberg warehouse path.")
  :type       :string
  :visibility :admin
  :default    "product-analytics/"
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-s3-endpoint
  (deferred-tru "S3 endpoint URL (for S3-compatible services like Garage).")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "http://localhost:3900")
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-s3-region
  (deferred-tru "AWS region for Iceberg S3 storage.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "us-east-1")
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-s3-access-key
  (deferred-tru "AWS access key ID for Iceberg S3 storage.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "test")
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-s3-secret-key
  (deferred-tru "AWS secret access key for Iceberg S3 storage.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "test")
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :never)

(setting/defsetting product-analytics-iceberg-s3-path-style-access
  (deferred-tru "Use path-style access for S3 requests (required for Garage and most S3-compatible services).")
  :type       :boolean
  :visibility :admin
  :default    (boolean (not config/is-prod?))
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-flush-interval-seconds
  (deferred-tru "How often (in seconds) the in-memory event buffer is flushed to Iceberg.")
  :type       :integer
  :visibility :admin
  :default    30
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting product-analytics-iceberg-flush-batch-size
  (deferred-tru "Maximum number of buffered events before an automatic flush to Iceberg.")
  :type       :integer
  :visibility :admin
  :default    1000
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

;;; ----------------------------------------- Query Engine Settings ------------------------------------------

(defn- reconfigure-pa-database-if-loaded!
  "Trigger PA database reconfiguration if the query-engine namespace is loaded."
  []
  (when-let [reconfigure! (resolve 'metabase-enterprise.product-analytics.query-engine/reconfigure-pa-database!)]
    (reconfigure!)))

(defsetting product-analytics-query-engine
  (deferred-tru "Query engine for reading Product Analytics data when using Iceberg storage.")
  :type       :keyword
  :visibility :admin
  :default    :app-db
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     (fn [new-value]
                (setting/set-value-of-type! :keyword :product-analytics-query-engine new-value)
                (reconfigure-pa-database-if-loaded!)))

(defsetting product-analytics-starburst-host
  (deferred-tru "Hostname of the Starburst/Trino server for querying Iceberg data.")
  :type       :string
  :visibility :admin
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     (fn [new-value]
                (setting/set-value-of-type! :string :product-analytics-starburst-host new-value)
                (reconfigure-pa-database-if-loaded!)))

(defsetting product-analytics-starburst-port
  (deferred-tru "Port of the Starburst/Trino server.")
  :type       :integer
  :visibility :admin
  :default    443
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     (fn [new-value]
                (setting/set-value-of-type! :integer :product-analytics-starburst-port new-value)
                (reconfigure-pa-database-if-loaded!)))

(defsetting product-analytics-starburst-catalog
  (deferred-tru "Iceberg catalog name configured in Starburst/Trino.")
  :type       :string
  :visibility :admin
  :default    "iceberg"
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     (fn [new-value]
                (setting/set-value-of-type! :string :product-analytics-starburst-catalog new-value)
                (reconfigure-pa-database-if-loaded!)))

(defsetting product-analytics-starburst-schema
  (deferred-tru "Schema within the Iceberg catalog for Product Analytics tables.")
  :type       :string
  :visibility :admin
  :default    "product_analytics"
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     (fn [new-value]
                (setting/set-value-of-type! :string :product-analytics-starburst-schema new-value)
                (reconfigure-pa-database-if-loaded!)))

(defsetting product-analytics-starburst-user
  (deferred-tru "Username for connecting to Starburst/Trino.")
  :type       :string
  :visibility :admin
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     (fn [new-value]
                (setting/set-value-of-type! :string :product-analytics-starburst-user new-value)
                (reconfigure-pa-database-if-loaded!)))

(defsetting product-analytics-starburst-ssl
  (deferred-tru "Use SSL when connecting to Starburst/Trino.")
  :type       :boolean
  :visibility :admin
  :default    true
  :feature    :product-analytics
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter
  :setter     (fn [new-value]
                (setting/set-value-of-type! :boolean :product-analytics-starburst-ssl new-value)
                (reconfigure-pa-database-if-loaded!)))
