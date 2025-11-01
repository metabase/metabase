(ns metabase-enterprise.remote-sync.init
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.remote-sync.events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.task.import]
   [metabase-enterprise.remote-sync.task.table-cleanup]
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

(SystemReader/setInstance (create-isolated-system-reader))

(defmethod startup/def-startup-logic! ::RemoteSyncInit [_]
  ;; Initialize Remote Sync features
  (future
    (try
      (settings/check-git-settings!)
      (impl/finish-remote-config!)
      (catch Throwable e
        (log/error e "Error during Remote Sync initialization: " (ex-message e))))))
