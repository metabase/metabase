(ns metabase-enterprise.git-source-of-truth.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting git-sync-token
  (deferred-tru "A GH token")
  :type :string
  :visibility :admin
  :doc true
  :export? false
  :encryption :when-encryption-key-set
  :audit :getter)

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

(defsetting git-sync-import-branch
  (deferred-tru "The git branch to pull from, e.g. `main`")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :default "main")

(defsetting git-sync-export-branch
  (deferred-tru "The git branch to push to, e.g. `new-changes`")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :default "main")

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

(defsetting git-sync-read-only
  (deferred-tru "Whether the instance is synced to git and read-only")
  :type :boolean
  :visibility :admin
  :export? false
  :default false)
