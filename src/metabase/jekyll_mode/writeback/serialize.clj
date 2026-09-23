(ns metabase.jekyll-mode.writeback.serialize
  (:require
   [metabase.util.yaml :as yaml]))

(defn serialize [instance]
  ;; TODO -- use Malli encoding on instance to prepare for serialization
  (yaml/generate-string (into (sorted-map) instance)
                        :dumper-options
                        {:flow-style            :block
                         :split-lines           false
                         :indent-with-indicator true}))

(defn deserialize [path-to-yaml-file]
  (yaml/from-file path-to-yaml-file))
