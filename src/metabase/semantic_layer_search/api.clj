(ns metabase.semantic-layer-search.api
  "Admin REST API for managing semantic layer entries: curated search prompts mapped to the entities
  that answer them."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private EntityRef
  [:map
   [:model :string]
   [:id    :int]
   [:name  {:optional true} :string]])

(def ^:private EntryType
  [:enum :canonical :sources])

(def ^:private Entry
  [:map
   [:id                 ms/PositiveInt]
   [:search_prompt      :string]
   [:usage_instructions {:optional true} [:maybe :string]]
   [:type               EntryType]
   [:entities           [:sequential EntityRef]]
   [:verified           :boolean]])

(def ^:private default-limit 50)
(def ^:private default-offset 0)

(api.macros/defendpoint :get "/"
  :- [:map
      [:data   [:sequential Entry]]
      [:total  :int]
      [:limit  :int]
      [:offset :int]]
  "Get all semantic layer entries, paginated. Optionally filter by type."
  [_route-params
   {:keys [type]} :- [:map
                      [:type {:optional true} [:maybe [:enum "canonical" "sources"]]]]]
  (api/check-superuser)
  (let [limit  (or (request/limit) default-limit)
        offset (or (request/offset) default-offset)]
    {:data   (t2/select :model/SemanticLayerIndex
                        (cond-> {:order-by [[:id :asc]]
                                 :limit    limit
                                 :offset   offset}
                          type (assoc :where [:= :type type])))
     :total  (if type
               (t2/count :model/SemanticLayerIndex :type type)
               (t2/count :model/SemanticLayerIndex))
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id"
  :- Entry
  "Get a semantic layer entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/SemanticLayerIndex :id id)))

(api.macros/defendpoint :post "/"
  :- Entry
  "Create a new semantic layer entry."
  [_route-params
   _query-params
   {:keys [search_prompt usage_instructions entities verified type]}
   :- [:map
       [:search_prompt      :string]
       [:usage_instructions {:optional true} [:maybe :string]]
       [:entities           [:sequential EntityRef]]
       [:type               {:optional true} [:maybe [:enum "canonical" "sources"]]]
       [:verified           {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (t2/insert-returning-instance! :model/SemanticLayerIndex
                                 {:search_prompt      search_prompt
                                  :usage_instructions usage_instructions
                                  :type               (or type "sources")
                                  :entities           entities
                                  :verified           (boolean verified)}))

(api.macros/defendpoint :put "/:id"
  :- Entry
  "Update a semantic layer entry by ID. Only the provided fields are changed."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [search_prompt usage_instructions entities verified type]}
   :- [:map
       [:search_prompt      {:optional true} :string]
       [:usage_instructions {:optional true} [:maybe :string]]
       [:entities           {:optional true} [:maybe [:sequential EntityRef]]]
       [:type               {:optional true} [:maybe [:enum "canonical" "sources"]]]
       [:verified           {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/SemanticLayerIndex :id id))
  (let [changes (cond-> {}
                  (some? search_prompt)      (assoc :search_prompt search_prompt)
                  (some? usage_instructions) (assoc :usage_instructions usage_instructions)
                  (some? type)               (assoc :type type)
                  (some? entities)           (assoc :entities entities)
                  (some? verified)           (assoc :verified (boolean verified)))]
    (when (seq changes)
      (t2/update! :model/SemanticLayerIndex id changes)))
  (t2/select-one :model/SemanticLayerIndex :id id))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a semantic layer entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/SemanticLayerIndex :id id))
  (t2/delete! :model/SemanticLayerIndex :id id)
  api/generic-204-no-content)
