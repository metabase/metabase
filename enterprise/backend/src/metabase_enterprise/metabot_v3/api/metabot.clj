(ns metabase-enterprise.metabot-v3.api.metabot
  "`/api/ee/metabot-v3/metabot` routes"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.request.core :as request]
   [toucan2.core :as t2]))

;; TODO: Eventually this should be paged but since we are just going to hardcode two models for now
;; lets not
(api.macros/defendpoint :get "/"
  "List configured metabot instances"
  []
  {:items (t2/select :model/Metabot {:order-by [[:name :asc]]})})

(api.macros/defendpoint :get "/:id"
  "Retrieve one metabot instance"
  [{:keys [id]} :- [:map [:id pos-int?]]]
  (api/check-404 (t2/select-one :model/Metabot :id id)))

(def ^:private default-entities-page-size 200)

(api.macros/defendpoint :get "/:id/entities"
  "List the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]]
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

(api.macros/defendpoint :put "/:id/entities"
  "Update the entities this metabot has access to"
  [{:keys [id]} :- [:map [:id pos-int?]]
   _query-params
   {:keys [items]} :- [:map
                       [:items [:sequential [:map
                                             [:id pos-int?]
                                             [:model [:enum "dataset" "metric" "collection"]]]]]]]
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (t2/with-transaction [_conn]
    (doseq [{model-id :id model :model} items]
      (when-not (t2/exists? :model/MetabotEntity
                            :metabot_id id
                            :model model
                            :model_id model-id)
        (t2/insert! :model/MetabotEntity
                    {:metabot_id id
                     :model model
                     :model_id model-id}))))
  api/generic-204-no-content)

(api.macros/defendpoint :delete ["/:id/entities/:model/:model-id" :model #"dataset|metric|collection"]
  "Remove an entity from this metabot's access list"
  [{:keys [id model model-id]} :- [:map
                                   [:id pos-int?]
                                   [:model [:enum "dataset" "metric" "collection"]]
                                   [:model-id pos-int?]]]
  (api/check-404 (t2/exists? :model/Metabot :id id))
  (t2/delete! :model/MetabotEntity
              :metabot_id id
              :model model
              :model_id model-id)
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/metabot` routes."
  (api.macros/ns-handler *ns* api/+check-superuser +auth))
