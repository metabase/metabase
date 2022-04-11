(ns metabase.linters.eastwood
  (:require [eastwood.lint :as eastwood]
            [metabase.linters.common :as common]))

(defn eastwood [options]
  (eastwood/eastwood-from-cmdline
   (merge
    {:source-paths (common/source-paths)}
    options)))
