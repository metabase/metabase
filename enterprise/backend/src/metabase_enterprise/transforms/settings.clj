(ns metabase-enterprise.transforms.settings
  (:require
   [metabase.config.core :as config]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(def ^:private is-not-prod? (or config/is-dev? config/is-test?))

(setting/defsetting transform-timeout
  (deferred-tru "The timeout for a transform job, in minutes.")
  :type :integer
  :visibility :internal
  :default (* 4 60)
  :feature :transforms
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-execution-server-url
  (deferred-tru "URL for the Python execution server that runs transform functions.")
  :type :string
  :visibility :admin
  :default (when is-not-prod? "http://localhost:5001")
  :feature :transforms
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-storage-s-3-endpoint
  (deferred-tru "S3 endpoint URL for storing Python execution artifacts.")
  :type :string
  :visibility :admin
  :default (when is-not-prod? "http://localhost:4566")
  :feature :transforms
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-storage-s-3-region
  (deferred-tru "AWS region for S3 storage.")
  :type :string
  :visibility :admin
  :default (when is-not-prod? "us-east-1")
  :feature :transforms
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-storage-s-3-bucket
  (deferred-tru "S3 bucket name for storing Python execution artifacts.")
  :type :string
  :visibility :admin
  :default (if is-not-prod? "metabase-python-runner" "metabase-cloud-python-runner-staging")
  :feature :transforms
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-storage-s-3-prefix
  (deferred-tru "Prefix to use for S3 objects. Necessary in prod where we only have access to a particular prefix.")
  :type :string
  :visibility :admin
  :feature :transforms
  :default (if is-not-prod? "test-prefix" "hosting-4b9351bb22b84791")
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-storage-s-3-access-key
  (deferred-tru "AWS access key ID for S3 authentication.")
  :type :string
  :visibility :admin
  :feature :transforms
  :default (when is-not-prod? "test")
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-storage-s-3-secret-key
  (deferred-tru "AWS secret access key for S3 authentication.")
  :type :string
  :visibility :admin
  :feature :transforms
  :default (when is-not-prod? "test")
  :doc false
  :export? false
  :encryption :when-encryption-key-set
  :audit :never)

(setting/defsetting python-storage-s-3-container-endpoint
  (deferred-tru "Alternative S3 endpoint accessible from containers. Leave empty if same as main endpoint.")
  :type :string
  :visibility :admin
  :default (when is-not-prod? "http://localstack:4566")
  :feature :transforms
  :doc false
  :export? false
  :encryption :no
  :audit :getter)

(setting/defsetting python-storage-s-3-path-style-access
  (deferred-tru "Use path-style access for S3 requests (required for LocalStack and some S3-compatible services).")
  :type :boolean
  :visibility :admin
  :default (when is-not-prod? true)
  :feature :transforms
  :doc false
  :export? false
  :encryption :no
  :audit :getter)
