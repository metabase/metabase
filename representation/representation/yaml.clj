(ns representation.yaml
  (:require [clj-yaml.core :as yaml]))

(set! *warn-on-reflection* true)

(defn parse-string
  "Parse YAML string to EDN data."
  [s]
  (yaml/parse-string s :keywords true))

(defn generate-string
  "Generate YAML string from EDN data."
  [data]
  (yaml/generate-string data :dumper-options {:flow-style :block}))
