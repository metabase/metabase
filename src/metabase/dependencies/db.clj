(ns metabase.dependencies.db
  "Application database query clauses for the dependencies module: the entities of the dependency graph that a user can
  read, as the `:items` queries of the dependencies specs select them."
  (:require
   [metabase.dependencies.items :as dependencies.items]
   [metabase.dependencies.registry :as dependencies.registry]
   [metabase.dependencies.schema :as dependencies.schema]
   [metabase.dependencies.spec :as dependencies.spec]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- visible-items-opts :- ::dependencies.items/items-opts
  "The options of the `:items` functions that select the entities readable by the user described by `user-id`,
  `is-superuser?` and `is-data-analyst?`, the archived ones as `include-archived-items` says, default `:exclude`, and
  nothing that only the lists leave out."
  [{:keys [user-id is-superuser? is-data-analyst? include-archived-items]
    :or   {include-archived-items :exclude}} :- ::dependencies.schema/visible-opts]
  {:user-id                       user-id
   :is-superuser?                 is-superuser?
   :is-data-analyst?              is-data-analyst?
   :include-archived              include-archived-items
   :include-personal-collections? true
   :include-internal?             true
   :include-sample-databases?     true})

(mu/defn items-query :- [:maybe ::h2x/honeysql-clause-opts]
  "The `:items` query of the spec of `model` for `opts`, marked as a subquery, or nil when the model is not listed or
  the user reads none of its entities."
  [model :- :keyword
   opts  :- ::dependencies.items/items-opts]
  (when-let [items (:items (dependencies.spec/spec model))]
    (some-> (items opts) (vary-meta assoc :allow-subquery true))))

(mu/defn visible-entities-clause :- ::h2x/honeysql-expr
  "Matches entities at `entity-type-field`/`entity-id-field` that are readable by the user described by `user-id`,
  `is-superuser?`, and `is-data-analyst?`, honoring `include-archived-items` (`:exclude`, `:all`, or `:only`,
  default `:exclude`): those that the `:items` query of the spec of their model selects for them, none of a model
  without one."
  [entity-type-field :- [:or :keyword :string]
   entity-id-field   :- [:or :keyword :string]
   visible           :- ::dependencies.schema/visible-opts]
  (let [opts (visible-items-opts visible)]
    (into [:or]
          (keep (fn [[entity-type model]]
                  (when-let [items (items-query model opts)]
                    [:and
                     [:= entity-type-field (name entity-type)]
                     [:in entity-id-field ^:allow-subquery {:select [:items.entity_id]
                                                            :from   [[items :items]]}]])))
          (dependencies.registry/type->model))))
