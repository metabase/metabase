(ns metabase.core.library
  (:require
   [metabase.classloader.core :as classloader]
   [metabase.util.log :as log]))

(defn initialize-from-git-if-available!
  "Shim for running the git source of truth code, used by [[metabase.core.core]]. The git source of truth code only ships in
  the Enterprise Edition™ JAR, so this checks whether the namespace exists, and if it does,
  invokes [[metabase-enterprise.library.core/initialize-from-git!]]; otherwise, this no-ops."
  []
  (when (try
          (classloader/require 'metabase-enterprise.library.core)
          :ok
          (catch Throwable _
            (log/debug "metabase-enterprise.library.core not available; cannot initialize from git.")
            nil))
    ((resolve 'metabase-enterprise.library.core/initialize-from-git!))))
