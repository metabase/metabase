(ns metabase.core.config-from-file
  (:require
   [metabase.plugins.classloader :as classloader]
   [metabase.util.log :as log]))

(defn init-from-file-if-code-available!
  "Shim for running the config-from-file code, used by [[metabase.core]]. The config-from-file code only ships in the
  Enterprise Edition™ JAR, so this checks whether the namespace exists, and if it does,
  invokes [[metabase-enterprise.advanced-config.file/initialize!]]; otherwise, this no-ops."
  []
  (when (try
          (classloader/require 'metabase-enterprise.advanced-config.file)
          :ok
          (catch Throwable _
            (log/debug "metabase-enterprise.advanced-config.file not available; cannot initialize from file.")
            nil))
    ((resolve 'metabase-enterprise.advanced-config.file/initialize!))))
