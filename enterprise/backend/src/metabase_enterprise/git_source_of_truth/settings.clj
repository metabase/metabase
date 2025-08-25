(ns metabase-enterprise.git-source-of-truth.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting github-api-key
  (deferred-tru "A github personal access token with 'repo' scope.")
  :type       :string
  :visibility :admin
  :doc        true
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :getter)

(defsetting github-repo-name
  (deferred-tru "The name of the repository where Metabase will store your library data.")
  :type       :string
  :visibility :admin
  :encryption :no
  :export?    false)

;; TODO: flip this to true if we have successfully pulled from the repo
(defsetting github-sync-configured
  (deferred-tru "Whether github sync is configured.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :encryption :no
  :default    false)
