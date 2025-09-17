(ns metabase-enterprise.remote-sync.settings
  (:require
   [metabase-enterprise.remote-sync.source :as source]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting git-sync-configured
  (deferred-tru "Whether git sync is configured.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :encryption :no
  :default    false)

(defn- verify-git-sync-configuration
  "Verifies that git sync is properly configured by checking repository access"
  []
  (try
    (when-let [source (source/source-from-settings)]
      (and (source/can-access-branch-in-source? source (setting/get :git-sync-import-branch))
           (some? (setting/get :git-sync-url))
           (some? (setting/get :git-sync-token))))
    (catch Exception _
      false)))

(defn- set-repo-with-verification!-fn [original-key]
  (fn [new-value]
    (setting/set-value-of-type! :string original-key new-value)
    (git-sync-configured! (verify-git-sync-configuration))))

(defsetting git-sync-import-branch
  (deferred-tru "The git branch to pull from, e.g. `main`")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :default "main"
  :setter (set-repo-with-verification!-fn :git-sync-import-branch))

(defsetting git-sync-token
  (deferred-tru "A GH token")
  :type :string
  :visibility :admin
  :doc true
  :export? false
  :encryption :when-encryption-key-set
  :audit :getter
  :setter (set-repo-with-verification!-fn :git-sync-token))

(defsetting git-sync-url
  (deferred-tru "The location of your git repository, e.g. https://github.com/acme-inco/metabase.git")
  :type       :string
  :visibility :admin
  :encryption :no
  :export?    false
  :setter (set-repo-with-verification!-fn :git-sync-url))

;; TODO actually use this
(defsetting git-sync-key
  (deferred-tru "An RSA key with write permissions to the git repository.")
  :type       :string
  :visibility :admin
  :doc        true
  :export?    false
  :encryption :when-encryption-key-set
  :audit      :getter)

(defsetting git-sync-export-branch
  (deferred-tru "The git branch to push to, e.g. `new-changes`")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :default "main")

(defsetting git-sync-type
  (deferred-tru "Git synchronization type - import or export")
  :type :string
  :visibility :authenticated
  :export? false
  :encryption :no
  :default "import")

(defsetting git-sync-allow-edit
  (deferred-tru "Whether library content can be edited on this instance")
  :type :boolean
  :visibility :authenticated
  :export? false
  :default false)
