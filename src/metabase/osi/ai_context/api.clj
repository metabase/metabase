(ns metabase.osi.ai-context.api
  "Admin REST API for managing `osi_ai_context` rows: OSI `ai_context` metadata attached to a library
  entity, addressed by its logical `(entity_type, entity_local_id)` key."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as app-db]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.osi.models.osi-ai-context :as osi-ai-context]
   [metabase.request.core :as request]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private writable-entity-types
  "Entity types accepted on writes — the real types callers name. Card flavors (metric/model) are stored
  under the canonical `card` key (see [[entity-retrieval/normalize-entity-type]]); tables and table-bound
  measures/segments keep their type. A plain question never matches an index doc, so it's rejected."
  #{"table" "metric" "model" "measure" "segment"})

(def ^:private max-item-len
  "Cap on each synonym/example string — these are short phrases or questions, not prose. They become
  embedded index docs, so this also keeps a single value under the embedding provider's token limit."
  1000)

(def ^:private max-list-len
  "Cap on the synonyms/examples list length — a curated entity needs a handful, not hundreds."
  50)

(def ^:private AiContext
  "OSI ai_context blob. All fields optional; extra keys tolerated for forward-compat with the OSI spec.
  String and list lengths are capped so a single curated entity can't bloat the index, its embeddings, or
  the agent prompt."
  [:map
   [:instructions {:optional true} [:maybe [:string {:max entity-retrieval/max-instructions-len}]]]
   [:synonyms     {:optional true} [:sequential {:max max-list-len} [:string {:max max-item-len}]]]
   [:examples     {:optional true} [:sequential {:max max-list-len} [:string {:max max-item-len}]]]])

(def ^:private AiContextInput
  "Accepted write shape for `ai_context` — the OSI `AIContext` oneOf.

  It is either an [[AiContext]] object or the bare-string shorthand. `:decode/api` folds the string into
  `{:instructions s}` before validation, so:

    - a string is length-capped as the `:instructions` it becomes, and
    - validation (and every read) only ever sees the object form."
  (mu/with AiContext {:decode/api osi-ai-context/->ai-context}))

(def ^:private Entry
  "An ai_context row as returned on reads. `entity_type` is any string: a row can predate a type's
  retirement (serdes tolerates those too), and one legacy row must not fail response validation for a list."
  [:map
   [:entity_type     :string]
   [:entity_local_id :int]
   [:ai_context      AiContext]])

(def ^:private default-limit 50)
(def ^:private default-offset 0)

(defn- get-entry
  "The stored row for an entity, looked up by its normalized key, or nil. The CRUD API speaks the real
  card flavors; storage keys on the canonical `card`, so normalize before matching."
  [entity-type entity-local-id]
  (t2/select-one :model/OsiAiContext
                 :entity_type (entity-retrieval/normalize-entity-type entity-type)
                 :entity_local_id entity-local-id))

(def ^:private logical-key-route-schema
  ;; entity-type is any non-blank string at the route level — a write to a non-writable type gets a clear
  ;; 400 in the handler (an enum here would 404 the route instead), and reads/deletes of an unknown type
  ;; simply find no row and 404.
  [:map
   [:entity-type     ms/NonBlankString]
   [:entity-local-id ms/PositiveInt]])

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
                        {:order-by [[:entity_type :asc] [:entity_local_id :asc]]
                         :limit    limit
                         :offset   offset})
     :total  (t2/count :model/OsiAiContext)
     :limit  limit
     :offset offset}))

(api.macros/defendpoint :get "/:entity-type/:entity-local-id"
  :- Entry
  "Get the ai_context entry for an entity by its logical `(entity_type, entity_local_id)` key."
  [{:keys [entity-type entity-local-id]} :- logical-key-route-schema
   _query-params]
  (api/check-superuser)
  (api/check-404 (get-entry entity-type entity-local-id)))

(api.macros/defendpoint :put "/:entity-type/:entity-local-id"
  :- Entry
  "Create or replace (upsert) the ai_context for an entity, addressed by its logical key. One row per
  entity: an existing row is updated in place rather than duplicated, and the compound primary key plus the
  upsert keep two concurrent writers from racing in a duplicate row."
  [{:keys [entity-type entity-local-id]} :- logical-key-route-schema
   _query-params
   {:keys [ai_context]} :- [:map [:ai_context AiContextInput]]]
  (api/check-superuser)
  (api/check-400 (contains? writable-entity-types entity-type)
                 "entity_type must be one of: measure, metric, model, segment, table")
  ;; Upsert on the normalized (stored) key so re-posting a relabelled card updates its one row.
  ;; update-or-insert! handles the compound key, the no-op re-PUT, and the concurrent-create race
  ;; (savepoint + single retry) centrally.
  (app-db/update-or-insert! :model/OsiAiContext
                            {:entity_type     (entity-retrieval/normalize-entity-type entity-type)
                             :entity_local_id entity-local-id}
                            (constantly {:ai_context ai_context}))
  (get-entry entity-type entity-local-id))

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
  Requires the library entity-retrieval feature; returns a 400 when the index is unavailable (the feature
  isn't licensed, or the pgvector store or embedding backend isn't configured)."
  [_route-params
   _query-params]
  (api/check-superuser)
  (api/check-400 (entity-retrieval/force-reconcile!)
                 (str "The library entity index is unavailable: it needs the library entity-retrieval "
                      "feature plus a configured pgvector store and embedding backend.")))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:entity-type/:entity-local-id"
  "Delete the ai_context entry for an entity by its logical key."
  [{:keys [entity-type entity-local-id]} :- logical-key-route-schema
   _query-params]
  (api/check-superuser)
  (api/check-404 (get-entry entity-type entity-local-id))
  (t2/delete! :model/OsiAiContext
              :entity_type (entity-retrieval/normalize-entity-type entity-type)
              :entity_local_id entity-local-id)
  api/generic-204-no-content)
