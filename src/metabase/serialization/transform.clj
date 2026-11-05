(ns metabase.serialization.transform
  "Spec transforms of columns: values kept as they are, dates, keywords, and the database ids of rows."
  (:require
   [metabase.serialization.resolve :as resolve]
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

(defn- column-values
  "The values `found`, a map from input to result, holds for the inputs `xs` of `model`, in order, nil for nil."
  [model xs found]
  (mapv #(when (some? %) (resolve/resolved-value found model %)) xs))

(defn column-refs
  "The references of the `model` rows with database ids `ids` (see [[resolve/row-refs]])."
  [store model ids]
  (column-values model ids (resolve/row-refs store model (into #{} (remove nil?) ids))))

(defn column-ids
  "The database ids of the `model` rows with references `refs`, with `opts` (see [[resolve/row-ids]])."
  [store model refs opts]
  (column-values model refs (resolve/row-ids store model (into #{} (remove nil?) refs) opts)))

(defn fk-transform
  "A spec transform between the database ids of `model` rows and their references."
  [model]
  {:export (fn [store _ ids _] (column-refs store model ids))
   :import (fn [store _ refs opts] (column-ids store model refs opts))})

(def user-transform
  "A spec transform between User ids and emails."
  (fk-transform :model/User))

(def database-transform
  "A spec transform between Database ids and names."
  (fk-transform :model/Database))

(def table-transform
  "A spec transform between Table ids and their `[db-name schema table-name]` references."
  (fk-transform :model/Table))

(def field-transform
  "A spec transform between Field ids and their `[db-name schema table-name & field-names]` references."
  (fk-transform :model/Field))
