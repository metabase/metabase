(ns metabase-enterprise.git-source-of-truth.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting git-sync-key
  (deferred-tru "An RSA key with write permissions to the git repository.")
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

(defsetting git-sync-default-branch
  (deferred-tru "The default branch for git sync.")
  :type       :string
  :visibility :authenticated
  :export?    false
  :encryption :no
  :default    nil)

(defsetting git-sync-path
  (deferred-tru "The path within the repo where your metabase files are located, e.g. `metabase/`")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :default ".")

;; TODO: flip this to true if we have successfully pulled from the repo
(defsetting git-sync-configured
  (deferred-tru "Whether git sync is configured.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :encryption :no
  :default    false)

(defsetting git-sync-entities
  (deferred-tru "A map of which entities are synced to git.")
  :type       :json
  :visibility :authenticated
  :encryption :no
  :export?    false)
