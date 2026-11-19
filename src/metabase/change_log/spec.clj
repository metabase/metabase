(ns metabase.change-log.spec
  "The change-log spec of a model, and what it says about the model.

  A model that has a spec is tracked: the change log records its inserts, updates and deletes. A spec is a map of:

  - `:track`, the columns whose change the change log records.
  - `:skip`, the columns whose change alone records nothing: usage stats that reads update, and what Metabase works
    out for its own use.

  Together they list every column of the table but `:id`, `:created_at` and `:updated_at`, which no spec lists."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(defmulti spec
  "The change-log spec of `model`, or nil when the change log does not track the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))

(def implicit-columns
  "The columns that no spec lists: the key, which never changes, and the timestamps that every write sets."
  #{:id :created_at :updated_at})

(defn tracked?
  "Whether the change log tracks `model`."
  [model]
  (some? (spec model)))

(defn tracked-models
  "The tracked models that have loaded."
  []
  (disj (set (keys (methods spec))) :default))

(defn tracked-column?
  "Whether a change of `column` of the tracked `model` is one the change log records."
  [model column]
  (contains? (set (:track (spec model))) column))
