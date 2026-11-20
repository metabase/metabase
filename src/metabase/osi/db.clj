(ns metabase.osi.db
  "Application database queries for the OSI module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.osi.schema :as osi.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private entity-models
  "The model of each `entity_type` of an OsiAiContext whose rows may not exist."
  {"card"    :model/Card
   "measure" :model/Measure
   "segment" :model/Segment})

(defn- entity-alias
  "The alias of the left joined table of the entities of `entity-type`."
  [entity-type]
  (keyword (str "entity_" entity-type)))

(defn- existing-contexts-query
  "The query of the OsiAiContexts whose entities exist, aliased `context`."
  []
  {:select    [:context.*]
   :from      [[(t2/table-name :model/OsiAiContext) :context]]
   :left-join (into [] (mapcat (fn [[entity-type model]]
                                 [[(t2/table-name model) (entity-alias entity-type)]
                                  [:and
                                   [:= :context.entity_type entity-type]
                                   [:= (u/qualified-key (entity-alias entity-type) :id) :context.entity_local_id]]]))
                    entity-models)
   :where     (into [:or [:not-in :context.entity_type (keys entity-models)]]
                    (map (fn [entity-type] [:not= (u/qualified-key (entity-alias entity-type) :id) nil]))
                    (keys entity-models))})

(mu/defn ai-context
  "The OsiAiContext of the entity with `entity-type` and `entity-local-id` when the entity exists, or nil."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt]
  (t2/select-one :model/OsiAiContext
                 (update (existing-contexts-query) :where
                         (fn [where]
                           [:and where
                            [:= :context.entity_type entity-type]
                            [:= :context.entity_local_id entity-local-id]]))))

(mu/defn ai-contexts-page
  "Up to `limit` OsiAiContexts whose entities exist from `offset`, ordered by entity type and local id."
  [limit  :- ms/PositiveInt
   offset :- ms/IntGreaterThanOrEqualToZero]
  (t2/select :model/OsiAiContext
             (assoc (existing-contexts-query)
                    :order-by [[:context.entity_type :asc] [:context.entity_local_id :asc]]
                    :limit    limit
                    :offset   offset)))

(mu/defn ai-context-count
  "The number of OsiAiContexts whose entities exist."
  []
  (t2/count :model/OsiAiContext (dissoc (existing-contexts-query) :select)))

(mu/defn delete-ai-context!
  "Delete the OsiAiContext of the entity with `entity-type` and `entity-local-id`, returning the number deleted."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt]
  (t2/delete! :model/OsiAiContext :entity_type entity-type :entity_local_id entity-local-id))

(mu/defn upsert-ai-context!
  "Insert or replace the `:ai_context` of the OsiAiContext of the entity with `entity-type` and `entity-local-id`
  with `ai-context`, returning its `[entity_type entity_local_id]` compound key."
  [entity-type      :- :string
   entity-local-id  :- ms/PositiveInt
   ai-context       :- ::osi.schema/osi-ai-context.ai-context]
  (app-db/update-or-insert! :model/OsiAiContext
                            {:entity_type     entity-type
                             :entity_local_id entity-local-id}
                            (constantly {:ai_context ai-context})))
