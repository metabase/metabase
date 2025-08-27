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

(setting/defsetting python-runner-base-url
  (deferred-tru "The base URL for the Python runner service. When Python runner is deployed as a separate service, update this URL.")
  :type       :string
  :visibility :internal
  :default    "http://localhost:3000"
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-runner-callback-base-url
  (deferred-tru "Where we call back to metabase from the container. DEPRECATED")
  :type       :string
  :visibility :internal
  :default    "http://host.docker.internal:3000"
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-runner-api-key
  (deferred-tru "API key for authenticating with the Python runner service.")
  :type       :string
  :visibility :internal
  :default    ""
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :never)

(setting/defsetting python-execution-server-url
  (deferred-tru "URL for the Python execution server that runs transform functions.")
  :type       :string
  :visibility :internal
  :default    "http://localhost:5001"
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)

(setting/defsetting python-execution-mount-path
  (deferred-tru "Base path for mounted directory shared between Metabase and Python execution container.")
  :type       :string
  :visibility :internal
  :default    "/tmp/python-exec-work"
  :feature    :transforms
  :doc        false
  :export?    false
  :encryption :no
  :audit      :getter)
