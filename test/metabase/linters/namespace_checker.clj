(ns metabase.linters.namespace-checker
  (:require [check-namespace-decls.core :as check-ns]
            [metabase.linters.common :as common]))

(defn check-namespace-decls [options]
  (check-ns/check-namespace-decls
   (merge
    {:source-paths (common/source-paths)}
    options)))
