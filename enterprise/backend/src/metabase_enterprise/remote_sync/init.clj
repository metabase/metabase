(ns metabase-enterprise.remote-sync.init
  (:require
   [metabase-enterprise.remote-sync.events]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.task.import]
   [metabase-enterprise.remote-sync.task.table-cleanup]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defmethod startup/def-startup-logic! ::RemoteSyncInit [_]
  ;; Initialize Remote Sync features.
  ;; Need to do this on startup because config may have changed since the last start when using env variables
  (future
    (try
      (settings/check-git-settings!)
      (impl/finish-remote-config! false)
      (catch Throwable e
        (log/error e "Error during Remote Sync initialization: " (ex-message e))))))
