(ns metabase.osi.ai-context.api
  "Admin REST API for managing `osi_ai_context` rows: OSI `ai_context` metadata attached to a library
  entity."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private EntityRef
  "Entity ref accepted on writes.
  The model must be one the reconciler indexes as a library entity; anything else (e.g. a plain
  `card`/`question`) would never match an index doc and is rejected."
  ;; the reconciler keys library Cards by their type (metric/model) and indexes table-bound measures/segments.
  [:map
   [:model [:enum "table" "metric" "model" "measure" "segment"]]
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
  "The existing row for this entity ref, matched on (model, id) only (the optional `:name` is ignored)."
  [{:keys [model id]}]
  ;; one row per entity is enforced here, not by a DB constraint — JSON-text uniqueness is brittle cross-DB.
  (some (fn [{e :entity :as row}]
          (when (and (= (:model e) model) (= (:id e) id)) row))
        (t2/select :model/OsiAiContext)))

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
    {:data   (t2/select :model/OsiAiContext
                        {:order-by [[:id :asc]]
                         :limit    limit
                         :offset   offset})
     :total  (t2/count :model/OsiAiContext)
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:id"
  :- Entry
  "Get an ai_context entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/OsiAiContext :id id)))

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
    (do (t2/update! :model/OsiAiContext (:id existing) {:entity entity :ai_context ai_context})
        (t2/select-one :model/OsiAiContext :id (:id existing)))
    (t2/insert-returning-instance! :model/OsiAiContext {:entity entity :ai_context ai_context})))

(api.macros/defendpoint :put "/:id"
  :- Entry
  "Update an ai_context entry by ID. Only the provided fields are changed; pointing `:entity` at an entity
  that another row already owns is rejected, preserving one row per entity."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   ;; patch semantics: presence of a key (not nil-ness of its value) decides what changes.
   {:keys [entity ai_context] :as body}
   :- [:map
       [:entity     {:optional true} EntityRef]
       [:ai_context {:optional true} AiContext]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/OsiAiContext :id id))
  (when (contains? body :entity)
    (let [owner (find-by-entity entity)]
      (api/check-400 (or (nil? owner) (= (:id owner) id))
                     "Another ai_context row already exists for that entity")))
  (let [changes (cond-> {}
                  (contains? body :entity)     (assoc :entity entity)
                  (contains? body :ai_context) (assoc :ai_context ai_context))]
    (when (seq changes)
      (t2/update! :model/OsiAiContext id changes)))
  (t2/select-one :model/OsiAiContext :id id))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete an ai_context entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/OsiAiContext :id id))
  (t2/delete! :model/OsiAiContext :id id)
  api/generic-204-no-content)
