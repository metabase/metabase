(ns metabase-enterprise.metabot-v3.api.metabot
  "`/api/ee/metabot-v3/metabot` routes"
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.dummy-tools :as metabot-v3.dummy-tools]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.request.core :as request]
   [toucan2.core :as t2]))

;; TODO: Eventually this should be paged but since we are just going to hardcode two models for now
;; lets not
(api.macros/defendpoint :get "/"
  "List configured metabot instances"
  []
  (api/check-superuser)
  {:items (t2/select :model/Metabot {:order-by [[:name :asc]]})})

(api.macros/defendpoint :get "/:id"
  "Retrieve one metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Metabot :id id)))

(def ^:private default-entities-page-size 200)

(api.macros/defendpoint :get "/:id/entities"
  "List the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (let [limit (or (request/limit) default-entities-page-size)
        offset (or (request/offset) 0)
        root-collection (collection/root-collection-with-ui-details nil)
        entities (t2/select [:model/MetabotEntity
                             :model_id
                             :model
                             [[:coalesce :card.name :collection.name] :name]
                             :created_at
                             [:parent_collection.id :collection_id]
                             [:parent_collection.name :collection_name]]
                            {:left-join [[:report_card :card] [:and [:in :model [[:inline "dataset"] [:inline "metric"]]]  [:= :model_id :card.id]]
                                         [:collection :collection] [:and [:= :model [:inline "collection"]]  [:= :model_id :collection.id]]
                                         ;; TODO: How to join parent collections from the location column?
                                         [:collection :parent_collection] [:= :card.collection_id :parent_collection.id]]
                             :where [:= :metabot_id id]
                             :limit limit
                             :offset offset
                             :order-by [[:name :asc]]})
        total (t2/count :model/MetabotEntity :metabot_id id)]
    {:items (for [{:keys [collection_id model] :as entity} entities]
              (cond-> entity
                (and (nil? collection_id)
                     (not= :collection model)) (assoc :collection_id (:id root-collection)
                                                      :collection_name (:name root-collection))))
     :total total
     :limit limit
     :offset offset}))

(defn- column-input
  [answer-source-column]
  (some-> answer-source-column (select-keys [:name :type :description :table-reference])))

(defn- metric-input
  [{:keys [queryable-dimensions default-time-dimension-field-id] :as answer-source-metric}]
  (let [default-time-dimension (when default-time-dimension-field-id
                                 (-> (m/find-first (comp #{default-time-dimension-field-id} :field-id)
                                                   queryable-dimensions)
                                     column-input))]
    (-> answer-source-metric
        (select-keys [:name :description])
        (assoc :queryable-dimensions (map column-input queryable-dimensions))
        (m/assoc-some :default-time-dimension default-time-dimension))))

(defn- model-input
  [answer-source-model]
  (-> answer-source-model
      (select-keys [:name :description :fields])
      (update :fields #(map column-input %))))

(defn- generate-sample-prompts
  [metabot-entity-ids]
  (lib.metadata.jvm/with-metadata-provider-cache
    (let [scope (metabot-v3.tools.u/metabot-scope metabot-entity-ids)
          {metrics :metric, models :model}
          (->> (for [[[card-type database-id] cards] (group-by (juxt :type :database_id) (keys scope))
                     detail (map (fn [detail card] (assoc detail ::origin card))
                                 (metabot-v3.dummy-tools/cards-details card-type database-id cards nil)
                                 cards)]
                 detail)
               (group-by :type))
          metric-inputs (map metric-input metrics)
          model-inputs (map model-input models)
          {:keys [table_questions metric_questions]}
          (metabot-v3.client/generate-example-questions {:metrics metric-inputs, :tables model-inputs})
          ->prompt (fn [{:keys [questions]} {::keys [origin]}]
                     (let [base {:metabot_entity_id (scope origin)
                                 :model             (:type origin)
                                 :card_id           (:id origin)}]
                       (map #(assoc base :prompt %) questions)))
          metric-prompts (mapcat ->prompt metric_questions metrics)
          model-prompts (mapcat ->prompt table_questions models)]
      (when (seq metric-prompts)
        (t2/insert! :model/MetabotPrompt metric-prompts))
      (when (seq model-prompts)
        (t2/insert! :model/MetabotPrompt model-prompts)))))

(api.macros/defendpoint :put "/:id/entities"
  "Update the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]
   _query-params
   {:keys [items]} :- [:map
                       [:items [:sequential [:map
                                             [:id pos-int?]
                                             [:model [:enum "dataset" "metric" "collection"]]]]]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (api/check-404 (t2/exists? :model/Metabot :id id))
    (let [new-entity-ids (into []
                               (keep (fn [{model-id :id model :model}]
                                       (when-not (t2/exists? :model/MetabotEntity
                                                             :metabot_id id
                                                             :model model
                                                             :model_id model-id)
                                         (t2/insert-returning-pk! :model/MetabotEntity
                                                                  {:metabot_id id
                                                                   :model model
                                                                   :model_id model-id}))))
                               items)]
      (generate-sample-prompts new-entity-ids)))
  api/generic-204-no-content)

(api.macros/defendpoint :delete ["/:id/entities/:model/:model-id" :model #"dataset|metric|collection"]
  "Remove an entity from this metabot's access list"
  [{:keys [id model model-id]} :- [:map
                                   [:id pos-int?]
                                   [:model [:enum "dataset" "metric" "collection"]]
                                   [:model-id pos-int?]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (t2/delete! :model/MetabotEntity
              :metabot_id id
              :model model
              :model_id model-id)
  api/generic-204-no-content)

(defn- delete-all-metabot-prompts
  [metabot-id]
  (t2/delete! :model/MetabotPrompt {:where [:exists {:select [:*]
                                                     :from   [[:metabot_entity :mbe]]
                                                     :where  [:and
                                                              [:= :mbe.id :metabot_prompt.metabot_entity_id]
                                                              [:= :mbe.metabot_id metabot-id]]}]}))

(api.macros/defendpoint :post "/:id/prompt-suggestions/regenerate"
  "Remove any existing prompt suggestions for the Metabot instance with `id` and generate new ones."
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (t2/with-transaction [_conn]
    (api/check-404 (t2/exists? :model/Metabot :id id))
    (when-let [entity-ids (not-empty (t2/select-pks-vec :model/MetabotEntity :metabot_id id))]
      (delete-all-metabot-prompts id)
      (generate-sample-prompts entity-ids)))
  api/generic-204-no-content)

(api.macros/defendpoint :get "/:id/prompt-suggestions"
  "Return the prompt suggestions for the metabot instance with `id`."
  [{:keys [id]} :- [:map [:id pos-int?]]
   {:keys [sample model model_id]} :- [:map
                                       [:sample {:optional true} :boolean]
                                       [:model {:optional true} [:enum "metric" "model"]]
                                       [:model_id {:optional true} pos-int?]]]
  (let [offset (if sample nil (request/offset))
        rand-fn (case (mdb/db-type)
                  :postgres :random
                  :rand)
        base-query (cond-> {:join  [[{:select [:id :name :type :metabot_entity_id]
                                      :from   [[(metabot-v3.tools.u/metabot-scope-query
                                                 [:= :mbe.metabot_id id])
                                                :scope]]}
                                     :card]
                                    [:and
                                     [:= :card.id                :metabot_prompt.card_id]
                                     [:= :card.metabot_entity_id :metabot_prompt.metabot_entity_id]]]
                            :where [:and]}
                     model    (update :where conj [:= :card.type model])
                     model_id (update :where conj [:= :card.id model_id]))
        total (t2/count :model/MetabotPrompt base-query)
        order-by (if sample
                   [[[rand-fn]]]
                   [[:card.name :asc]
                    [:id :asc]])
        prompts (t2/select [:model/MetabotPrompt
                            :id
                            :prompt
                            :model
                            [:card_id :model_id]
                            [:card.name :model_name]
                            :created_at
                            :updated_at]
                           (cond-> base-query
                             true             (assoc :order-by order-by)
                             (request/limit)  (assoc :limit    (request/limit))
                             offset           (assoc :offset   offset)))]
    {:prompts prompts
     :limit   (request/limit)
     :offset  offset
     :total   total}))

(api.macros/defendpoint :delete "/:id/prompt-suggestions"
  "Delete all prompt suggestions for the metabot instance with `id`."
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-superuser)
  (delete-all-metabot-prompts id)
  api/generic-204-no-content)

(api.macros/defendpoint :delete "/:id/prompt-suggestions/:prompt-id"
  "Delete the prompt suggestion with ID `prompt-id` for the metabot instance with `id`."
  [{:keys [id prompt-id]} :- [:map
                              [:id pos-int?]
                              [:prompt-id pos-int?]]]
  (api/check-superuser)
  (t2/delete! :model/MetabotPrompt {:where [:and
                                            [:= :id prompt-id]
                                            [:exists {:select [:*]
                                                      :from   [[:metabot_entity :mbe]]
                                                      :where  [:and
                                                               [:= :mbe.id :metabot_prompt.metabot_entity_id]
                                                               [:= :mbe.metabot_id id]]}]]})
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/metabot` routes."
  (api.macros/ns-handler *ns* +auth))
