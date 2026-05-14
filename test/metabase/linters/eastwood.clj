(ns metabase.linters.eastwood
  (:require
   [eastwood.lint :as eastwood]
   [metabase.linters.common :as common])
  (:import (java.io File)))

(set! *warn-on-reflection* true)

(defn eastwood
  "Entrypoint for running Eastwood from the CLI. Adds some programatically-determined config options. See comments in
  `deps.edn` for usage instructions."
  [options]
  (eastwood/eastwood-from-cmdline
   (merge
    {:source-paths (common/source-paths)}
    options)))

(defn eastwood-tests
  "Entry-point for the :eastwood/test alias. Derives :source-paths from classpath directories
  whose basename is `test` so we don't have to hardcode the per-driver test paths in deps.edn —
  they're already on the classpath via :drivers-dev's :extra-paths. Excludes `.clj-kondo/test`,
  which is for clj-kondo hook tests and uses a different toolchain."
  [options]
  (eastwood/eastwood-from-cmdline
   (merge
    {:source-paths (filterv (fn [^File f]
                              (and (= "test" (.getName f))
                                   (not= ".clj-kondo" (some-> (.getParentFile f) .getName))))
                            (common/source-paths))}
    options)))
