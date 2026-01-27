(ns build.python
  "Build step to install Python dependencies (sqlglot) for GraalVM Python."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [environ.core :as env]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(def ^:private python-sources-dir
  "Directory where sqlglot and sql_tools.py shim live."
  (u/filename u/project-root-directory "resources" "python-sources"))

(def ^:private sqlglot-version
  "Pinned sqlglot version for reproducible builds.
  Read from .sqlglot-version file (single source of truth for both dev and build)."
  (-> (io/file u/project-root-directory "resources/python-sources/.sqlglot-version")
      slurp
      str/trim))

(defn build-python-deps!
  "Install sqlglot to resources/python-sources for bundling into uberjar.

  Uses `uv pip install` for speed, with fallback to standard `pip` if uv is unavailable.
  The --no-compile flag skips .pyc generation since GraalVM Python uses interpreted mode.

  Can be skipped by setting SKIP_PYTHON_DEPS=true (useful until Track 2 runtime support is ready)."
  [_edition]
  (if (= (env/env :skip-python-deps) "true")
    (u/announce "Skipping Python dependencies (SKIP_PYTHON_DEPS=true)")
    (u/step "Install Python dependencies (sqlglot)"
            ;; Ensure directory exists (sql_tools.py should already be there)
      (u/create-directory-unless-exists! python-sources-dir)
            ;; Try uv first (fast), fall back to pip
      (let [{:keys [exit]} (u/sh* {:dir u/project-root-directory}
                                  "uv" "pip" "install" (str "sqlglot==" sqlglot-version)
                                  "--target" python-sources-dir
                                  "--no-compile")]
        (if (zero? exit)
          (u/announce "sqlglot installed via uv to %s" python-sources-dir)
          (do
            (u/step "uv not available, falling back to pip"
              (u/sh {:dir u/project-root-directory}
                    "pip" "install" (str "sqlglot==" sqlglot-version)
                    "--target" python-sources-dir
                    "--no-compile"))
            (u/announce "sqlglot installed via pip to %s" python-sources-dir)))))))
