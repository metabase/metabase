(ns metabase-enterprise.git-source-of-truth.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting git-sync-key
  (deferred-tru "An rsa key with write permissions to the git repository.")
  :type       :string
  :visibility :admin
  :doc        true
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :getter)

(defsetting git-sync-url
  (deferred-tru "The location of your git repository, e.g. https://github.com/acme-inco/metabase.git")
  :type       :string
  :visibility :admin
  :encryption :no
  :export?    false)

;; TODO: flip this to true if we have successfully pulled from the repo
(defsetting git-sync-configured
  (deferred-tru "Whether github sync is configured.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :encryption :no
  :default    false)
