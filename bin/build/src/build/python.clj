(ns build.python
  "Build step to install Python dependencies (sqlglot) for GraalVM Python."
  (:require
   [clojure.java.io :as io]
   [environ.core :as env]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(def ^:private python-sources-dir
  "Directory where sqlglot and sql_tools.py shim live."
  (u/filename u/project-root-directory "resources" "python-sources"))

(def ^:private sqlglot-version
  "Pinned sqlglot version for reproducible builds.
  Read from pyproject.toml (single source of truth for both dev and build)."
  (->> (io/file u/project-root-directory "resources/python-sources/pyproject.toml")
       slurp
       (re-find #"\"sqlglot==([^\"]+)\"")
       second))

(defn build-python-deps!
  "Install sqlglot to resources/python-sources for bundling into uberjar.

  Uses `uv pip install`. The --no-compile flag skips .pyc generation since GraalVM Python
  uses interpreted mode.

  Can be skipped by setting SKIP_PYTHON_DEPS=true."
  [_edition]
  (if (= (env/env :skip-python-deps) "true")
    (u/announce "Skipping Python dependencies (SKIP_PYTHON_DEPS=true)")
    (u/step "Install Python dependencies (sqlglot)"
      (u/create-directory-unless-exists! python-sources-dir)
      (u/sh {:dir u/project-root-directory}
            "uv" "pip" "install" "-r" (u/filename python-sources-dir "pyproject.toml")
            "--target" python-sources-dir
            "--no-compile")
      (u/announce "sqlglot %s installed to %s" sqlglot-version python-sources-dir))))
