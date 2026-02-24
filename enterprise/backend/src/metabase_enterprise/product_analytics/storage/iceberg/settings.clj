(ns metabase-enterprise.product-analytics.storage.iceberg.settings
  "Settings for the Iceberg storage backend for Product Analytics."
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :as setting]
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
