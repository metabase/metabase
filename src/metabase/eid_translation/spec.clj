(ns metabase.eid-translation.spec
  "The entity-id translation spec of a model, a map of `:names`, the names by which the API asks to translate the entity
  ids of the model."
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
