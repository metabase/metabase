(ns metabase.osi.db
  "Application database queries for the OSI module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.osi.schema :as osi.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn ai-context :- [:maybe ::osi.schema/osi-ai-context]
  "The OsiAiContext of the entity with `entity-type` and `entity-local-id`, or nil."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt]
  (t2/select-one :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id))

(mu/defn ai-contexts-page :- [:sequential ::osi.schema/osi-ai-context]
  "Up to `limit` OsiAiContexts from `offset`, ordered by entity type and local id."
  [limit  :- ms/PositiveInt
   offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/OsiAiContext
             {:order-by [[:entity_type :asc] [:entity_local_id :asc]]
              :limit    limit
              :offset   offset}))

(mu/defn ai-context-count :- ms/IntGreaterThanOrEqualToZero
  "The number of OsiAiContexts."
  []
  (t2/count :model/OsiAiContext))

(mu/defn delete-ai-context! :- :int
  "Delete the OsiAiContext of the entity with `entity-type` and `entity-local-id`, returning the number deleted."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt]
  (t2/delete! :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id))

(mu/defn update-ai-context! :- :int
  "Apply `changes` to the OsiAiContext of the entity with `entity-type` and `entity-local-id`, returning the
  number updated."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt
   changes          :- :map]
  (t2/update! :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id changes))

(mu/defn upsert-ai-context! :- [:tuple :string ms/PositiveInt]
  "Insert or replace the `:ai_context` of the OsiAiContext of the entity with `entity-type` and `entity-local-id`
  with `ai-context`, returning its `[entity_type entity_local_id]` compound key."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt
   ai-context       :- :map]
  (app-db/update-or-insert! :model/OsiAiContext
                            {:entity_type     entity-type
                             :entity_local_id entity-local-id}
                            (constantly {:ai_context ai-context})))
