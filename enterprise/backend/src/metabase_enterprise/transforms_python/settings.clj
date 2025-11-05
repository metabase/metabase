(ns metabase-enterprise.transforms-python.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(setting/defsetting python-runner-url
  (deferred-tru "URL for the Python execution server that runs transform functions.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "http://localhost:5001")
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-runner-api-token
  (deferred-tru "API token for authorizing with the python-runner service.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "dev-token-12345")
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :never)

(setting/defsetting python-storage-s-3-endpoint
  (deferred-tru "S3 endpoint URL for storing Python execution artifacts.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "http://localhost:4566")
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-storage-s-3-region
  (deferred-tru "AWS region for S3 storage.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "us-east-1")
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-storage-s-3-bucket
  (deferred-tru "S3 bucket name for storing Python execution artifacts.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "metabase-python-runner")
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-storage-s-3-prefix
  (deferred-tru "Prefix to use for S3 objects. Necessary in prod where we only have access to a particular prefix.")
  :type       :string
  :visibility :admin
  :feature    :transforms-python
  :default    (when (not config/is-prod?) "test-prefix")
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-storage-s-3-access-key
  (deferred-tru "AWS access key ID for S3 authentication.")
  :type       :string
  :visibility :admin
  :feature    :transforms-python
  :default    (when (not config/is-prod?) "test")
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-storage-s-3-secret-key
  (deferred-tru "AWS secret access key for S3 authentication.")
  :type       :string
  :visibility :admin
  :feature    :transforms-python
  :default    (when (not config/is-prod?) "test")
  :doc        false
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :never)

(setting/defsetting python-storage-s-3-container-endpoint
  (deferred-tru "Alternative S3 endpoint accessible from containers. Leave empty if same as main endpoint.")
  :type       :string
  :visibility :admin
  :default    (when (not config/is-prod?) "http://localstack:4566")
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-storage-s-3-path-style-access
  (deferred-tru "Use path-style access for S3 requests (required for LocalStack and some S3-compatible services).")
  :type       :boolean
  :visibility :admin
  :default    (when (not config/is-prod?) true)
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-runner-timeout-seconds
  (deferred-tru "Timeout in seconds for Python script execution. Defaults to 30 minutes (1800 seconds).")
  :type       :integer
  :visibility :admin
  :default    1800 ;; 30 minutes
  :feature    :transforms-python
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-runner-test-run-timeout-seconds
  (deferred-tru "Timeout in seconds for Python script test runs. Defaults to 1 minute (60 seconds).")
  :type :integer
  :visibility :admin
  :default 60
  :feature :transforms-python
  :doc false
  :export? false
  :encryption :no
  :audit :getter)
