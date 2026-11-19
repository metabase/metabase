(ns metabase.dependencies.spec
  "The dependencies spec of a model, and what it says about the model.

  A model that has a spec with a `:type` is an entity of the dependency graph, stored under that type. All the keys are
  optional:

  - `:type`, the entity type the graph stores the model's rows under, which makes the model an entity.
  - `:inlined?`, true for an entity that its dependents expand inline, such as a snippet or a measure, so that its
    dependents are all its transitive dependents, and the job computes its type first; false by default.
  - `:items`, a fn of the `:metabase.dependencies.items/items-opts` returning the full HoneySQL query of the entities
    the dependencies lists hold for them, as `entity_id`, `name` and `location`, which reads the user's permissions
    itself, or nil when the user reads none; the lists and the visibility of the graph hold no entity of a model
    without it.
  - `:hydrate`, a fn of a vector of rows returning them with what `:dependencies` needs, loaded in bulk.
  - `:dependencies`, a pure fn of a hydrated row returning its dependencies as `{entity-type #{entity-id}}`, which
    makes the job compute the entity's dependencies.
  - `:analysis`, a fn of a row, whose query reads the metadata of its own database, returning the set of errors its
    analysis finds, empty when it is fine, which makes the job analyze the entity.
  - `:after-dependencies`, a fn of a row and its direct dependents as `{entity-type #{entity-id}}` returning the
    dependents whose edges to the entity no longer hold, which the job drops after it stores the dependencies.

  The consumer that marks the statuses a write makes stale reads the writes of every model with a spec, through these
  plain data keys:

  - `:dependency-columns`, the columns whose update has the dependency job compute the entity's dependencies again.
  - `:analysis-columns`, the columns whose update has the analysis job analyze the entity again.
  - `:output-columns`, the columns whose update changes what the entities depending on the entity read.
  - `:part-of`, for a model whose rows are parts of an entity, `{:type entity-type :key column}`: the entity of the type
    whose id the column holds, or with `:via [model column]` the one whose id that column holds of the row of that
    model whose id the column holds.
  - `:part-columns`, with `:part-of`, the columns whose update changes the entity the row is a part of."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Spec
  "The schema of a dependencies spec."
  [:map {:closed true}
   [:type               {:optional true} :keyword]
   [:inlined?           {:optional true} :boolean]
   [:items              {:optional true} ifn?]
   [:hydrate            {:optional true} ifn?]
   [:dependencies       {:optional true} ifn?]
   [:analysis           {:optional true} ifn?]
   [:after-dependencies {:optional true} ifn?]
   [:dependency-columns {:optional true} [:set :keyword]]
   [:analysis-columns   {:optional true} [:set :keyword]]
   [:output-columns     {:optional true} [:set :keyword]]
   [:part-of            {:optional true} [:map {:closed true}
                                          [:type :keyword]
                                          [:key  :keyword]
                                          [:via  {:optional true} [:tuple :keyword :keyword]]]]
   [:part-columns       {:optional true} [:set :keyword]]])

(defmulti spec
  "The dependencies spec of `model`, or nil when the dependency graph reads nothing of the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))
