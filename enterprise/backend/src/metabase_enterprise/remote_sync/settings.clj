(ns metabase-enterprise.remote-sync.settings
  (:require
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting remote-sync-configured
  (deferred-tru "Whether git sync is configured.")
  :type       :boolean
  :visibility :authenticated
  :export?    false
  :encryption :no
  :default    false)

(defsetting remote-sync-branch
  (deferred-tru "The remote branch to sync with, e.g. `main`")
  :type :string
  :visibility :admin
  :encryption :no
  :export? false
  :default "main")

(defsetting remote-sync-token
  (deferred-tru "A GH token")
  :type :string
  :visibility :admin
  :doc true
  :export? false
  :encryption :when-encryption-key-set
  :audit :getter)

(defsetting remote-sync-url
  (deferred-tru "The location of your git repository, e.g. https://github.com/acme-inco/metabase.git")
  :type       :string
  :visibility :admin
  :encryption :no
  :export?    false)

(defsetting remote-sync-type
  (deferred-tru "Git synchronization type - import or export")
  :type :string
  :visibility :authenticated
  :export? false
  :encryption :no
  :default "import")

(defsetting remote-sync-allow-edit
  (deferred-tru "Whether library content can be edited on this instance")
  :type :boolean
  :visibility :authenticated
  :export? false
  :default false)

(defn check-settings
  "Check that the given settings are valid and update if they are. Throws exception if they are not."
  [remote-sync-url remote-sync-token remote-sync-branch]
  (let [source (git/git-source remote-sync-url #p remote-sync-token)
        branch-exists (boolean (get (set (source.p/branches source)) remote-sync-branch))]
    (when-not branch-exists
      (throw (ex-info (deferred-tru "Branch not found") {:branch remote-sync-branch}
                      {:status-code 400})))))

(defn check-and-update-settings!
  "Check that the given settings are valid and update if they are. Throws exception if they are not."
  [remote-sync-url remote-sync-token remote-sync-branch remote-sync-type]
  (check-settings remote-sync-url remote-sync-token remote-sync-branch)
  (setting/set-many! {:remote-sync-url    remote-sync-url
                      :remote-sync-token  remote-sync-token
                      :remote-sync-branch remote-sync-branch
                      :remote-sync-type   remote-sync-type}))
