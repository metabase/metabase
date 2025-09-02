(ns metabase-enterprise.transforms.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(setting/defsetting transform-timeout
  (deferred-tru "The timeout for a transform job, in minutes.")
  :type       :integer
  :visibility :internal
  :default    (* 4 60)
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-execution-server-url
  (deferred-tru "URL for the Python execution server that runs transform functions.")
  :type       :string
  :visibility :admin
  :default    "http://localhost:5001"
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

;; TODO break this out to narrower settings to make the UX better?
(setting/defsetting python-storage-config
  (deferred-tru "Storage configuration for Python execution artifacts. JSON format with type, endpoint, credentials, etc.")
  :type       :json
  :visibility :admin
  :default    {:type "s3"
               :endpoint "http://localhost:4566"
               :region "us-east-1"
               :bucket "metabase-python-runner"
               :access-key-id "test"
               :secret-access-key "test"
               :path-style-access true
               ;; Optional: different endpoint accessible from containers
               :container-endpoint "http://localstack:4566"}
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :never)
