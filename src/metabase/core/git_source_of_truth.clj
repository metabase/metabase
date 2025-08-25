(ns metabase.core.git-source-of-truth
  (:require
   [metabase.classloader.core :as classloader]
   [metabase.util.log :as log]))

(defn initialize-from-git-if-available!
  "Shim for running the git source of truth code, used by [[metabase.core.core]]. The git source of truth code only ships in
  the Enterprise Edition™ JAR, so this checks whether the namespace exists, and if it does,
  invokes [[metabase-enterprise.git-source-of-truth.core/initialize-from-git!]]; otherwise, this no-ops."
  []
  (when (try
          (classloader/require 'metabase-enterprise.git-source-of-truth.core)
          :ok
          (catch Throwable _
            (log/debug "metabase-enterprise.git-source-of-truth.core not available; cannot initialize from git.")
            nil))
    ((resolve 'metabase-enterprise.git-source-of-truth.core/initialize-from-git!))))