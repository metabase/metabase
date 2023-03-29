(ns metabase.linters.eastwood
  (:require
   [eastwood.lint :as eastwood]
   [metabase.linters.common :as common]))

(defn eastwood
  "Entrypoint for running Eastwood from the CLI. Adds some programatically-determined config options. See comments in
  `deps.edn` for usage instructions."
  [options]
  (eastwood/eastwood-from-cmdline
   (merge
    {:source-paths (common/source-paths)}
    options)))
