(ns metabase-enterprise.remote-sync.init
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.task.import]
   [metabase-enterprise.remote-sync.task.table-cleanup]
   [metabase.collections.models.collection :as collection]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log])
  (:import
   (org.eclipse.jgit.storage.file FileBasedConfig)
   (org.eclipse.jgit.util FS SystemReader SystemReader$Delegate)))

(set! *warn-on-reflection* true)

(defn- create-isolated-system-reader
  "Creates a SystemReader that does not read any system git configuration.
  This prevents JGit from reading ~/.gitconfig or /etc/gitconfig files."
  []
  (let [base-reader (SystemReader/getInstance)]
    (proxy [SystemReader$Delegate] [base-reader]
      (getenv [variable]
        (if (= "GIT_CONFIG_NOSYSTEM" variable)
          "true"
          (.getenv base-reader variable)))

      (openUserConfig [_config ^FS fs]
        (proxy [FileBasedConfig] [(io/file "_no_config_") ^FS fs]
          (load [] nil)
          (save [] nil)))

      (openSystemConfig [_config ^FS fs]
        (proxy [FileBasedConfig] [(io/file "_no_config_")  ^FS fs]
          (load [] nil)
          (save [] nil))))))

(defn- remote-sync-init []
  (if (settings/remote-sync-enabled)
    (do
      (when (= :read-only (settings/remote-sync-type))
        (let [branch (settings/remote-sync-branch)]
          (when (str/blank? branch)
            (throw (ex-info "Remote sync is enabled with read-only type, but no branch is set." {})))
          (when (remote-sync.object/dirty?)
            (if (str/includes? (settings/remote-sync-allow) "overwrite-unpublished")
              (impl/async-import! branch true {})
              (throw (ex-info "Remote sync is enabled with read-only type, but there are unpublished changes. To force an overwrite, set `MB_REMOTE_SYNC_ALLOW=overwrite-unpublished`" {}))))))

      (when-not (collection/has-remote-synced-collection?)
        (if (nil? (settings/remote-sync-branch))
          (log/warn "Remote sync is enabled but no remote-sync branch is set. Cannot do initial import.")
          (do
            (log/info "Remote sync is enabled but no remote-sync collection exists. Importing")
            (impl/async-import! (settings/remote-sync-branch) true {})))))
    (when (collection/has-remote-synced-collection?)
      (log/info "Remote sync is disabled but a remote-synced collection exists. Marking collections as not remote-sync.")
      (collection/clear-remote-synced-collection!))))

(SystemReader/setInstance (create-isolated-system-reader))

(defmethod startup/def-startup-logic! ::remote-sync-setup
  [_]
  (remote-sync-init))
