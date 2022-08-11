(ns metabase.linters.namespace-checker
  (:require [check-namespace-decls.core :as check-ns]
            [metabase.linters.common :as common]))

(defn check-namespace-decls
  "Entrypoint for running the namespace linter from the CLI. Adds some programatically-determined config options. See
  comments in `deps.edn` for usage instructions."
  [options]
  (check-ns/check-namespace-decls
   (merge
    {:source-paths (common/source-paths)}
    options)))
