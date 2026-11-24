(ns metabase.eid-translation.spec
  "The entity-id translation spec of a model, a map of `:names`, the names by which the API asks to translate the entity
  ids of the model, and, optionally, `:references`, the map from each column that holds the ids of other rows but that
  the model's serialization spec skips, deriving it on import, to the model of those rows, `:structures`, the
  columns holding structures with ids inside, such as a query, that the serialization spec exports, and `:transforms`,
  the map from each column holding a structure with ids inside that the serialization spec skips to a transform whose
  `:export` exports it as the API gives it. A response with entity ids (see [[metabase.eid-translation.responses]])
  names the rows of `:references` by their refs too, and gives each column of `:structures` as serialization exports
  it and each column of `:transforms` as its transform exports it."
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
