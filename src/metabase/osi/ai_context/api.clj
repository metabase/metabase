(ns metabase.osi.ai-context.api
  "Admin REST API for managing `osi_ai_context` rows: OSI `ai_context` metadata attached to a library
  entity."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as app-db]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private writable-entity-type
  "Entity types accepted on writes — the real types callers name. Card flavors (metric/model) are stored
  under the canonical `card` key (see [[entity-retrieval/normalize-entity-type]]); tables and table-bound
  measures/segments keep their type. A plain question never matches an index doc, so it's rejected."
  [:enum "table" "metric" "model" "measure" "segment"])

(def ^:private AiContext
  "OSI ai_context blob. All fields optional; extra keys tolerated for forward-compat with the OSI spec."
  [:map
   [:instructions {:optional true} [:maybe :string]]
   [:synonyms     {:optional true} [:sequential :string]]
   [:examples     {:optional true} [:sequential :string]]])

(def ^:private Entry
  "An ai_context row as returned on reads. `entity_type` is any string: a row can predate a type's
  retirement (serdes tolerates those too), and one legacy row must not fail response validation for a list."
  [:map
   [:id              ms/PositiveInt]
   [:entity_type     :string]
   [:entity_local_id :int]
   [:ai_context      AiContext]])

(def ^:private default-limit 50)
(def ^:private default-offset 0)

(defn- find-by-entity
  "The existing row for this entity, or nil.
  Normalizes the type to the stored key, so a card is found whichever flavor (metric/model) the caller
  names; one row per entity is enforced by the `(entity_type, entity_local_id)` unique constraint."
  [entity-type entity-local-id]
  (t2/select-one :model/OsiAiContext
                 :entity_type (entity-retrieval/normalize-entity-type entity-type)
                 :entity_local_id entity-local-id))

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
  ai_context row it is updated in place rather than duplicated.
  The unique `(entity_type, entity_local_id)` constraint plus an upsert keep two concurrent creates from
  racing in a duplicate row."
  [_route-params
   _query-params
   {:keys [entity_type entity_local_id ai_context]}
   :- [:map
       [:entity_type     writable-entity-type]
       [:entity_local_id ms/PositiveInt]
       [:ai_context      AiContext]]]
  (api/check-superuser)
  ;; Key the upsert on the normalized (stored) type so re-posting a relabelled card updates its one row.
  (let [pk (app-db/update-or-insert! :model/OsiAiContext
                                     {:entity_type     (entity-retrieval/normalize-entity-type entity_type)
                                      :entity_local_id entity_local_id}
                                     (constantly {:ai_context ai_context}))]
    (t2/select-one :model/OsiAiContext :id pk)))

(api.macros/defendpoint :put "/:id"
  :- Entry
  "Update an ai_context entry by ID. Only the provided fields are changed; pointing it at an entity that
  another row already owns is rejected, preserving one row per entity. `entity_type` and `entity_local_id`
  must be provided together."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   ;; patch semantics: presence of a key (not nil-ness of its value) decides what changes.
   {:keys [entity_type entity_local_id ai_context] :as body}
   :- [:map
       [:entity_type     {:optional true} writable-entity-type]
       [:entity_local_id {:optional true} ms/PositiveInt]
       [:ai_context      {:optional true} AiContext]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/OsiAiContext :id id))
  (when (or (contains? body :entity_type) (contains? body :entity_local_id))
    (api/check-400 (and (contains? body :entity_type) (contains? body :entity_local_id))
                   "entity_type and entity_local_id must be provided together")
    (let [owner (find-by-entity entity_type entity_local_id)]
      (api/check-400 (or (nil? owner) (= (:id owner) id))
                     "Another ai_context row already exists for that entity")))
  (let [changes (cond-> {}
                  (contains? body :entity_type)     (assoc :entity_type entity_type)
                  (contains? body :entity_local_id) (assoc :entity_local_id entity_local_id)
                  (contains? body :ai_context)      (assoc :ai_context ai_context))]
    (when (seq changes)
      (t2/update! :model/OsiAiContext id changes)))
  (t2/select-one :model/OsiAiContext :id id))

(api.macros/defendpoint :post "/reconcile"
  :- [:map
      [:index     [:map
                   [:inserted  :int]
                   [:deleted   :int]
                   [:unchanged :int]]]
      [:execution [:map
                   [:waited_ms :int]
                   [:ran_ms    :int]]]]
  "Force a reconcile of the library entity index against the application database, blocking until a
  reconcile covering this call finishes.
  Returns the index mutations (`index`) separately from execution timing (`execution`: how long the run
  waited to start, then how long it ran).
  This call never reuses a reconcile already in progress (it may have started before your latest change);
  it starts one if the index is idle, otherwise it queues a single follow-up that any other waiting calls
  share.
  Requires the semantic search feature; returns a 400 when it isn't configured."
  [_route-params
   _query-params]
  (api/check-superuser)
  (api/check-400 (entity-retrieval/force-reconcile!)
                 "The library entity index requires semantic search, which is not configured."))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete an ai_context entry by ID."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/OsiAiContext :id id))
  (t2/delete! :model/OsiAiContext :id id)
  api/generic-204-no-content)
