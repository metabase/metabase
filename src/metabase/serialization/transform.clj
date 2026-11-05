(ns metabase.serialization.transform
  "Spec transforms of columns: values kept as they are, dates and keywords."
  (:require
   [metabase.util.date-2 :as u.date]))

(set! *warn-on-reflection* true)

(defn export-unchanged
  "An export transform fn that keeps the values as they are."
  [_store _batch values _opts]
  (vec values))

(defn import-unchanged
  "An import transform fn that keeps the values as they are."
  [_store _batch values _opts]
  (vec values))

(defn export-dates
  "An export transform fn that formats temporal values in the stable serialization format."
  [_store _batch values _opts]
  (mapv #(some-> % u.date/format) values))

(defn import-dates
  "An import transform fn that parses formatted temporal values back."
  [_store _batch values _opts]
  (mapv #(cond-> % (string? %) u.date/parse) values))

(defn export-keywords
  "An export transform fn that names keyword values."
  [_store _batch values _opts]
  (mapv #(some-> % name) values))

(defn import-keywords
  "An import transform fn that keywordizes named values, so comparisons in model hooks see the values they store."
  [_store _batch values _opts]
  (mapv #(some-> % keyword) values))

(def import-only-transform
  "A transform of a column that is imported as it is but never exported."
  {:import import-unchanged})

(def date-transform
  "A transform of temporal values, by [[export-dates]] and [[import-dates]]."
  {:export export-dates :import import-dates})

(def keyword-transform
  "A transform of keyword values, by [[export-keywords]] and [[import-keywords]]."
  {:export export-keywords :import import-keywords})
