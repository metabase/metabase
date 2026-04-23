(ns metabase.core.config-from-file
  (:require
   [metabase.classloader.core :as classloader]
   [metabase.util.log :as log]
   [metabase.warehouses-rest.metadata-file-import :as metadata-file-import]))

(defn init-from-file-if-code-available!
  "Shim for running the config-from-file code, used by [[metabase.core.core]]. The config-from-file code only ships in
  the Enterprise Edition™ JAR, so this checks whether the namespace exists, and if it does,
  invokes [[metabase-enterprise.advanced-config.file/initialize!]]; otherwise, this no-ops.

  After the EE config-from-file hook (if any), also runs
  [[metadata-file-import/initialize-from-env!]] to stream `MB_TABLE_METADATA_PATH` and
  `MB_FIELD_VALUES_PATH` into the appdb. That loader hard-fails if the env vars are set without
  `disable-sync`, so it must run after settings have been applied from `config.yml`."
  []
  (when (try
          (classloader/require 'metabase-enterprise.advanced-config.file)
          :ok
          (catch Throwable _
            (log/debug "metabase-enterprise.advanced-config.file not available; cannot initialize from file.")
            nil))
    ((resolve 'metabase-enterprise.advanced-config.file/initialize!)))
  (metadata-file-import/initialize-from-env!))
