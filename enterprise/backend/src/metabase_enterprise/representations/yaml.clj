(ns metabase-enterprise.representations.yaml
  "Centralized YAML utilities for representations with consistent formatting options."
  (:require
   [metabase.util.yaml :as yaml]))

(def ^:private yaml-options
  "Standard YAML formatting options for all representations."
  {:flow-style :block
   :indent 2
   :indicator-indent 2
   :indent-with-indicator true})

(defn generate-string
  "Generate YAML string from EDN data with standard representations formatting."
  [data]
  (yaml/generate-string data yaml-options))

(defn parse-string
  "Parse YAML string to EDN data."
  [s]
  (yaml/parse-string s))

(defn from-file
  "Read and parse YAML file to EDN data."
  [filename]
  (yaml/from-file filename))
