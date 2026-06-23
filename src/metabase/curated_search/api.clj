(ns metabase.curated-search.api
  "Admin REST API for managing `osi_ai_context` rows: OSI `ai_context` metadata attached to a library
  entity."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private EntityRef
  "Entity ref as accepted on writes: the model must be a known agent-facing entity type (as used with
  read_resource), plus plain \"card\"."
  [:map
   [:model [:enum "table" "card" "model" "metric" "question"]]
   [:id    ms/PositiveInt]
   [:name  {:optional true} :string]])

(def ^:private EntityRefOut
  "Entity ref as returned on reads. `:model` is any string: rows can predate a model string's retirement
  (serdes tolerates those too), and one legacy row must not fail response validation for a whole list."
  [:map
   [:model :string]
   [:id    :int]
   [:name  {:optional true} :string]])

(def ^:private AiContext
  "OSI ai_context blob. All fields optional; extra keys tolerated for forward-compat with the OSI spec."
  [:map
   [:instructions {:optional true} [:maybe :string]]
   [:synonyms     {:optional true} [:sequential :string]]
   [:examples     {:optional true} [:sequential :string]]])

(def ^:private Entry
  [:map
   [:id         ms/PositiveInt]
   [:entity     EntityRefOut]
   [:ai_context AiContext]])

(def ^:private default-limit 50)
(def ^:private default-offset 0)

(defn- find-by-entity
  "The existing row for this entity ref, matched on (model, id) only (the optional `:name` is ignored).
  One ai_context row per entity is enforced here, not by a DB constraint (JSON-text uniqueness is brittle
  cross-DB)."
  [{:keys [model id]}]
  (some (fn [{e :entity :as row}]
          (when (and (= (:model e) model) (= (:id e) id)) row))
        (t2/select :model/CuratedSearchEntry)))

(api.macros/defendpoint :get "/"
  :- [:map
      [:data   [:sequential Entry]]
      [:total  :int]
      [:limit  :int]
      [:offset :int]]
  "Get all ai_context entries, paginated."
  [_route-params
   _query-params]
  (api/check-superuser)
  (let [limit  (or (request/limit) default-limit)
        offset (or (request/offset) default-offset)]
    {:data   (t2/select :model/CuratedSearchEntry
                        {:order-by [[:id :asc]]
                         :limit    limit
                         :offset   offset})
     :total  (t2/count :model/CuratedSearchEntry)
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id"
  :- Entry
  "Get an ai_context entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CuratedSearchEntry :id id)))

(api.macros/defendpoint :post "/"
  :- Entry
  "Create (or replace) the ai_context for an entity. One row per entity: if the entity already has an
  ai_context row it is updated in place rather than duplicated."
  [_route-params
   _query-params
   {:keys [entity ai_context]}
   :- [:map
       [:entity     EntityRef]
       [:ai_context AiContext]]]
  (api/check-superuser)
  (if-let [existing (find-by-entity entity)]
    (do (t2/update! :model/CuratedSearchEntry (:id existing) {:entity entity :ai_context ai_context})
        (t2/select-one :model/CuratedSearchEntry :id (:id existing)))
    (t2/insert-returning-instance! :model/CuratedSearchEntry {:entity entity :ai_context ai_context})))

(api.macros/defendpoint :put "/:id"
  :- Entry
  "Update an ai_context entry by ID. Only the provided fields are changed."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   ;; patch semantics: presence of a key (not nil-ness of its value) decides what changes.
   {:keys [entity ai_context] :as body}
   :- [:map
       [:entity     {:optional true} EntityRef]
       [:ai_context {:optional true} AiContext]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CuratedSearchEntry :id id))
  (let [changes (cond-> {}
                  (contains? body :entity)     (assoc :entity entity)
                  (contains? body :ai_context) (assoc :ai_context ai_context))]
    (when (seq changes)
      (t2/update! :model/CuratedSearchEntry id changes)))
  (t2/select-one :model/CuratedSearchEntry :id id))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete an ai_context entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/CuratedSearchEntry :id id))
  (t2/delete! :model/CuratedSearchEntry :id id)
  api/generic-204-no-content)
