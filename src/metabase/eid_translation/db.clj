(ns metabase.eid-translation.db
  "Application database queries for the entity id translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn ids-by-entity-ids :- [:map-of :string :int]
  "A map of entity id to id for the rows of `model` whose entity id is in `entity-ids`."
  [model      :- :keyword
   entity-ids :- [:sequential :string]]
  (when-not (every? string? entity-ids)
    (throw (ex-info "entity ids must be strings" {:entity-ids entity-ids})))
  (mdb/select-batched-map #(t2/select-fn->fn :entity_id :id [model :id :entity_id] :entity_id [:in %]) entity-ids))
