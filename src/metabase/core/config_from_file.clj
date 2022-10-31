(ns metabase.core.config-from-file
  (:require
   [clojure.tools.logging :as log]
   [metabase.plugins.classloader :as classloader]))

(defn init-from-file-if-code-available!
  "Shim for running the config-from-file code, used by [[metabase.core]]. The config-from-file code only ships in the
  Enterprise Edition™ JAR, so this checks whether the namespace exists, and if it does,
  invokes [[metabase-enterprise.config-from-file.core/initialize!]]; otherwise, this no-ops."
  []
  (when (try
          (classloader/require 'metabase-enterprise.config-from-file.core)
          :ok
          (catch Throwable _
            (log/debug "metabase-enterprise.config-from-file.core not available; cannot initialize from file.")
            nil))
    ((resolve 'metabase-enterprise.config-from-file.core/initialize!))))
