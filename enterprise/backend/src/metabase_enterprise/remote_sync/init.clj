(ns metabase-enterprise.remote-sync.init
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.remote-sync.events]
   [metabase-enterprise.remote-sync.settings]
   [metabase-enterprise.remote-sync.task.import]
   [metabase-enterprise.remote-sync.task.table-cleanup])
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
