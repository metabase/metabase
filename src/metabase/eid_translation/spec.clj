(ns metabase.eid-translation.spec
  "The entity-id translation spec of a model, a map of `:names`, the names by which the API asks to translate the entity
  ids of the model, and, optionally, `:references`, the map from each column that holds the ids of other rows but that
  the model's serialization spec skips, deriving it on import, to the model of those rows. A response with entity ids
  (see [[metabase.eid-translation.responses]]) names those rows by their refs too."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(defmulti spec
  "The entity-id translation spec of `model`, or nil when the API does not translate the entity ids of the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))
