(ns metabase-enterprise.dependencies.calculation
  "The dependencies of the entities, computed by the functions of the dependencies specs of their models."
  (:require
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.schema :as deps.schema]
   [metabase.dependencies.core :as dependencies]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn computed-types :- [:sequential ::deps.dependency-types/dependency-types]
  "The entity types whose dependencies the job computes, those that their dependents expand inline first, so that
  they are known when their dependents are computed; a table has none of its own, the links to it being found from
  the other side."
  []
  (->> (dependencies/type->model)
       (keep (fn [[entity-type model]]
               (let [spec (dependencies/spec model)]
                 (when (:dependencies spec)
                   [(not (:inlined? spec)) (name entity-type) entity-type]))))
       sort
       (mapv peek)))

(mu/defn hydrate-entities :- [:sequential :map]
  "The rows `entities` of `entity-type` with what computing their dependencies needs, loaded in bulk."
  [entity-type :- ::deps.dependency-types/dependency-types
   entities    :- [:sequential :map]]
  (if-let [hydrate (:hydrate (dependencies/entity-spec entity-type))]
    (vec (hydrate (vec entities)))
    (vec entities)))

(mu/defn calculate-deps :- ::deps.schema/upstream-deps
  "The dependencies of the hydrated `entity` of `entity-type`, as `{entity-type #{entity-id}}`."
  [entity-type :- ::deps.dependency-types/dependency-types
   entity      :- :map]
  ((:dependencies (dependencies/entity-spec entity-type)) entity))

(mu/defn after-dependencies :- [:maybe ifn?]
  "The `:after-dependencies` of the spec of `entity-type`, a fn of an entity and its direct dependents returning those
  whose edges to it no longer hold, or nil."
  [entity-type :- ::deps.dependency-types/dependency-types]
  (:after-dependencies (dependencies/entity-spec entity-type)))
