(ns metabase.analyze.schema
  "Schemas used by the analyze code."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::no-kebab-case-keys (ms/MapWithNoKebabKeys))

(mr/def ::Table
  [:and
   (ms/InstanceOf :model/Table)
   ::no-kebab-case-keys])

;; TODO: fix memory issues with `mu/defn` and `ms/InstanceOf` so we don't need to do this
(def Table
  "Schema for a valid instance of a Metabase Table. Using this with `mu/defn` uses less memory than using `(ms/InstanceOf :model/Table)`"
  [:ref ::Table])

(mr/def ::Field
  [:and
   (ms/InstanceOf :model/Field)
   ::no-kebab-case-keys])

(def Field
  "Schema for a valid instance of a Metabase Field. Using this with `mu/defn` uses less memory than using `(ms/InstanceOf :model/Field)`"
  [:ref ::Field])
