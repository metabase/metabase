(ns metabase.dependencies.spec
  "The dependencies spec of a model, and what it says about the model.

  A model that has a spec with a `:type` is an entity of the dependency graph, stored under that type. All the keys are
  optional:

  - `:type`, the entity type the graph stores the model's rows under, which makes the model an entity.
  - `:inlined?`, true for an entity that its dependents expand inline, such as a snippet or a measure, so that its
    dependents are all its transitive dependents, and the job computes its type first; false by default.
  - `:hydrate`, a fn of a vector of rows returning them with what `:dependencies` needs, loaded in bulk.
  - `:dependencies`, a pure fn of a hydrated row returning its dependencies as `{entity-type #{entity-id}}`, which
    makes the job compute the entity's dependencies.
  - `:after-dependencies`, a fn of a row and its direct dependents as `{entity-type #{entity-id}}` returning the
    dependents whose edges to the entity no longer hold, which the job drops after it stores the dependencies.
  - `:analysis`, a fn of a row, whose query reads the metadata of its own database, returning the set of errors its
    analysis finds, empty when it is fine, which makes the job analyze the entity."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Spec
  "The schema of a dependencies spec."
  [:map {:closed true}
   [:type               {:optional true} :keyword]
   [:inlined?           {:optional true} :boolean]
   [:hydrate            {:optional true} ifn?]
   [:dependencies       {:optional true} ifn?]
   [:after-dependencies {:optional true} ifn?]
   [:analysis           {:optional true} ifn?]])

(defmulti spec
  "The dependencies spec of `model`, or nil when no dependency is tracked for the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))
