(ns metabase.xrays.spec
  "The x-rays spec of a model, and what it says about the model.

  A model that has a spec has related entities found for it. A spec is a map of:

  - `:related`, a fn of an entity of the model returning the map of the related entities the related-entities API
    returns for it.
  - `:definition`, optional, a fn of an entity of the model returning the parts of its definition that carry semantic
    meaning, which similarity compares, for a model whose entities are ranked by similarity."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Spec
  "The schema of an x-rays spec."
  [:map {:closed true}
   [:related    ifn?]
   [:definition {:optional true} ifn?]])

(defmulti spec
  "The x-rays spec of `model`, or nil when no related entities are found for the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))

(defn models
  "The models that have a spec and have loaded."
  []
  (disj (set (keys (methods spec))) :default))
