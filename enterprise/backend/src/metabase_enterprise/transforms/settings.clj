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
