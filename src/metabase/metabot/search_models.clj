(ns metabase.metabot.search-models
  "Maps Metabot entity-type names to the `model` strings used by the search index."
  (:require
   [metabase.util :as u]))

(def ^:private entity->search
  "Entity-type strings whose Metabot name differs from the search `model` string. Unchanged names are omitted."
  {"model"    "dataset"
   "question" "card"})

(def ^:private search->entity
  (u/for-map [[k v] entity->search] [v k]))

(defn entity-type->search-model
  "Metabot entity-type (string or keyword) → search `model` string.
   Unknown types yield themselves, even if they're not actual entity types."
  [entity-type]
  (let [s (if (keyword? entity-type) (name entity-type) (str entity-type))]
    (get entity->search s s)))

(defn search-model->entity-type
  "Inverse of [[entity-type->search-model]]."
  [search-model]
  (get search->entity search-model search-model))
