(ns metabase-enterprise.remote-sync.settings
  (:require
   [metabase-enterprise.remote-sync.source.git :as git]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defsetting remote-sync-enabled
  (deferred-tru "Is Git sync currently enabled?")
  :type :boolean
  :visibility :authenticated
  :export? false
  :encryption :no
  :default true)

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
  :type :string
  :visibility :admin
  :encryption :no
  :export? false)

(defsetting remote-sync-type
  (deferred-tru "Git synchronization type - import or export")
  :type :string
  :visibility :authenticated
  :export? false
  :encryption :no
  :default "import")

(defsetting remote-sync-auto-import
  (deferred-tru "Whether to automatically import from the remote git repository. Only applies if remote-sync-type is ''import''.")
  :type :boolean
  :visibility :authenticated
  :export? false
  :encryption :no
  :default false)

(defsetting remote-sync-auto-import-rate
  (deferred-tru "If remote-sync-type is ''import'' and remote-sync-auto-import is true, the rate (in minutes) at which to check for updates to import. Defaults to 5.")
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default 5)

(defsetting remote-sync-task-time-limit-ms
  (deferred-tru "The maximum amount of time a remote sync task will be given to complete")
  :type :integer
  :visibility :authenticated
  :export? false
  :encryption :no
  :default (* 1000 60 60))

(defn check-git-settings
  "Check that the given settings are valid and update if they are. Throws exception if they are not."
  [{:keys [remote-sync-url remote-sync-token remote-sync-branch]}]
  (try
    (git/git-source remote-sync-url remote-sync-branch remote-sync-token)
    (catch Exception e
      (throw (ex-info "Unable to connect to git repository with the provided settings" {:cause (.getMessage e)} e)))))

(defn check-and-update-remote-settings!
  "Check that the given git settings are valid and update if they are. Throws exception if they are not."
  [settings]
  (check-git-settings settings)
  (t2/with-transaction [_conn]
    (doseq [key [:remote-sync-url :remote-sync-token :remote-sync-type :remote-sync-branch :remote-sync-enabled]]
      (when (contains? settings :remote-sync-url)
        (setting/set! key (settings key))))))
