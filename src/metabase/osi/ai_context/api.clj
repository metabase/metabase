(ns metabase.osi.ai-context.api
  "Admin REST API for managing `osi_ai_context` rows: OSI `ai_context` metadata attached to a library
  entity, addressed by its logical `(entity_type, entity_local_id)` key."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as app-db]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.osi.models.osi-ai-context :as osi-ai-context]
   [metabase.request.core :as request]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private writable-entity-types
  "Entity types accepted on writes — the real types callers name. Card flavors (metric/model) are stored
  under the canonical `card` key (see [[entity-retrieval/normalize-entity-type]]); tables and table-bound
  measures/segments keep their type. A plain question never matches an index doc, so it's rejected."
  #{"table" "metric" "model" "measure" "segment"})

(defn- check-writable-entity-type!
  [entity-type]
  (api/check-400 (contains? writable-entity-types entity-type)
                 "entity_type must be one of: measure, metric, model, segment, table"))

(def AiContext
  "The model-owned closed schema used for writes and generated output."
  osi-ai-context/AiContext)

(def ^:private AiContextResponse
  "Lenient read schema for legacy and forward-compatible rows.

  The map is open and deliberately omits write-time length and item constraints, so one row imported by
  SerDes, written directly, or produced by a newer version cannot fail an entire list response. Read
  consumers already truncate instructions and ignore unusable index values. Clients should continue to
  write the closed [[AiContext]] schema."
  [:map
   [:instructions {:optional true} [:maybe :string]]
   [:synonyms     {:optional true} [:maybe [:sequential :any]]]
   [:examples     {:optional true} [:maybe [:sequential :any]]]])

(def ^:private Entry
  "An ai_context row as returned on reads. `entity_type` is any string: a row can predate a type's
  retirement (serdes tolerates those too), and one legacy row must not fail response validation for a list.
  `data_source` is lenient for the same reason — a value written by a newer node during a rolling deploy must
  not 500 the list on an older one.

  `basis` never rides a response: reads narrow to [[osi-ai-context/api-columns]]."
  [:map {:closed true}
   [:entity_type     :string]
   [:entity_local_id :int]
   [:ai_context      AiContextResponse]
   [:data_source     :keyword]
   [:generated_at        [:maybe ms/TemporalInstant]]
   [:invalidated_at      [:maybe ms/TemporalInstant]]
   [:basis_invalidated_at [:maybe ms/TemporalInstant]]
   [:rewrite_requested_at [:maybe ms/TemporalInstant]]
   [:generator_version   [:maybe :string]]
   [:created_at           ms/TemporalInstant]
   [:updated_at           ms/TemporalInstant]])

(def ^:private default-limit 50)
(def ^:private default-offset 0)

(def ^:private api-model
  "`:model/OsiAiContext` narrowed to the columns a read returns — everything but `basis`."
  (into [:model/OsiAiContext] osi-ai-context/api-columns))

(defn- get-entry
  "The stored row for an entity, looked up by its normalized key, or nil. The CRUD API speaks the real
  card flavors; storage keys on the canonical `card`, so normalize before matching."
  [entity-type entity-local-id]
  (t2/select-one api-model
                 :entity_type (entity-retrieval/normalize-entity-type entity-type)
                 :entity_local_id entity-local-id))

(defn- rewrite-request-stamp
  [now generated-at]
  (if generated-at
    (let [minimum (t/plus generated-at (t/millis 1))]
      (if (t/after? now minimum) now minimum))
    now))

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
    {:data   (t2/select api-model
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
  upsert keep two concurrent writers from racing in a duplicate row.

  Any write here is an approval: the row's `data_source` becomes `human`, and generated content is never
  overwritten again without an explicit regenerate.
  `updated_at` records the human edit; `generated_at` stays unchanged."
  [{:keys [entity-type entity-local-id]} :- logical-key-route-schema
   _query-params
   ;; Accept the object as-is (`ms/Map` is open) so unknown keys reach the handler: the api layer strips keys a
   ;; closed request schema doesn't declare, which would silently drop a mistyped field instead of rejecting it.
   {:keys [ai_context]} :- [:map [:ai_context [:or :string ms/Map]]]]
  (api/check-superuser)
  (check-writable-entity-type! entity-type)
  (let [ai-context (osi-ai-context/->ai-context ai_context)]
    (api/check-400 (mr/validate AiContext ai-context)
                   "ai_context must be a string or an object with only instructions, synonyms, and examples")
    ;; Upsert on the normalized (stored) key so re-posting a relabelled card updates its one row.
    ;; update-or-insert! handles the compound key, the no-op re-PUT, and the concurrent-create race
    ;; (savepoint + single retry) centrally.
    ;; Leave `basis` untouched because it describes the generator's last write.
    (let [stored-type (entity-retrieval/normalize-entity-type entity-type)]
      (app-db/update-or-insert! :model/OsiAiContext
                                {:entity_type     stored-type
                                 :entity_local_id entity-local-id}
                                (constantly {:ai_context  ai-context
                                             :data_source :human}))
      (get-entry entity-type entity-local-id))))

(api.macros/defendpoint :post "/:entity-type/:entity-local-id/regenerate"
  :- Entry
  "Request that the OSI generation job rewrite this entity's ai_context on its next run.

  Records the request, which forces the rewrite even when nothing about the entity has changed since it was
  last generated. The current `ai_context` is left in place and keeps serving until the job replaces it;
  nothing here calls an LLM.

  404 when the entity has no ai_context row — there is nothing to rewrite."
  [{:keys [entity-type entity-local-id]} :- logical-key-route-schema
   _query-params]
  (api/check-superuser)
  (check-writable-entity-type! entity-type)
  (let [conditions {:entity_type     (entity-retrieval/normalize-entity-type entity-type)
                    :entity_local_id entity-local-id}]
    ;; A rewrite is pending only when `rewrite_requested_at` is later than `generated_at`.
    ;; The generator may advance `generated_at` between our read and write.
    ;; The model's `:hook/timestamped?` hook bumps `updated_at` on every write.
    ;; Compare and swap on that timestamp to detect the generator's write-back.
    ;; On conflict, refetch the row and recompute a stamp that outranks its current `generated_at`.
    (loop [attempt 0]
      (let [entry (api/check-404 (get-entry entity-type entity-local-id))
            now   (t/offset-date-time)
            ;; Use the later of now and one millisecond after `generated_at`, protecting against clock skew
            ;; and timestamp truncation. Keep `basis`: it remains valid prompt history, while the request has
            ;; its own column.
            stamp (rewrite-request-stamp now (:generated_at entry))]
        (cond
          ;; Keep `data_source` unchanged until generated content actually replaces the row. Changing it when
          ;; the rewrite is merely requested would immediately hide human-approved instructions from the agent.
          (pos? (t2/update! :model/OsiAiContext
                            (assoc conditions :updated_at (:updated_at entry))
                            {:rewrite_requested_at stamp}))
          (get-entry entity-type entity-local-id)

          (< attempt 4)
          (recur (inc attempt))

          :else
          (throw (ex-info "Could not record the regenerate request; the row is being written concurrently."
                          {:status-code 409})))))))

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
