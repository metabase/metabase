(ns metabase-enterprise.serialization.v2.load
  "Loading is the interesting part of deserialization: integrating the maps \"ingested\" from files into the appdb.
  See the detailed breakdown of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.string :as str]
   [diehard.core :as dh]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.transient-error :as transient-error]
   [metabase.models.serialization :as serdes]
   [metabase.remote-sync.branching :as remote-sync.branching]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(declare load-one!)

(defn- with-retries
  "Retries `f` up to `max-retries` times when it throws a transient DB error (deadlock, lock timeout, etc.).
  Uses exponential backoff starting at `base-delay-ms`. Error classification is appdb-type-aware
  via [[metabase.app-db.transient-error/transient-error?]]."
  [max-retries base-delay-ms f]
  (let [db-type (mdb/db-type)]
    (dh/with-retry {:max-retries max-retries
                    :backoff-ms  [base-delay-ms (* base-delay-ms (bit-shift-left 1 max-retries)) 2.0]
                    :retry-if    (fn [_result exception]
                                   (transient-error/transient-error? db-type exception))
                    :on-retry    (fn [_result exception]
                                   (log/warnf "Transient DB error, retrying: %s"
                                              (ex-message exception)))}
      (f))))

(def ^:private model->circular-dependency-keys
  "Sometimes models have circular dependencies. For example, a card for a Dashboard Question has a `dashboard_id`
  pointing to the dashboard it's in. But when we try to load that dashboard, we'll create all its dashcards, and one
  of those dashcards will point to the card we started with.

  This map works around this: given a model (e.g. `Card`) that triggered a dependency loop, it provides the set of
  top-level keys to remove from the model so that we'll be able to successfully load it. The stripped keys are restored
  when the original (outer) load of the entity completes its full pass."
  {"Dashboard" #{:dashcards :parameters}
   "Document"  #{:document}
   "Card"      #{:dashboard_id :document_id :parameters}})

(defn- keys-to-strip [ingested]
  (let [model (-> ingested :serdes/meta last :model)]
    (or (model->circular-dependency-keys model)
        (throw (ex-info "Don't know which keys to remove to break circular dependency!"
                        {:entity ingested
                         :model  model
                         :error  ::no-known-references})))))

(defn- load-deps!
  "Given a list of `deps` (hierarchies), [[load-one]] them all.
  If [[load-one]] throws because it can't find that entity in the filesystem, check if it's already loaded in
  our database."
  [ctx deps]
  (if (empty? deps)
    ctx
    (letfn [(loader [ctx dep]
              (try
                (load-one! ctx dep)
                (catch Exception e
                  (cond
                    ;; It was missing, but we found it locally, so just return the context.
                    (and (= (:error (ex-data e)) ::not-found)
                         (serdes/load-find-local dep))
                    ctx

                    :else
                    (throw e)))))]
      (reduce loader ctx deps))))

(defn- safe-local-id
  "Looks up the local primary key for `path`, swallowing any exception from the DB lookup.

  [[path-error-data]] is called from catch blocks. When the original failure was a SQL error it may
  have poisoned the current transaction, so any subsequent query (including
  [[serdes/load-find-local]]) will throw `current transaction is aborted, commands ignored until end of
  transaction block` and shadow the real cause. We prefer losing `:local-id` over losing the exception chain."
  [path]
  (try
    (when-let [entity (serdes/load-find-local path)]
      ((t2/select-pks-fn entity) entity))
    (catch Exception e
      (log/debugf e "Could not look up local id for %s while building load error data" (serdes/log-path-str path))
      nil)))

(defn- path-error-data [error-type expanding path]
  (let [last-model (:model (last path))]
    {:path       (mapv (partial into {}) path)
     :local-id   (safe-local-id path)
     :deps-chain expanding
     :model      last-model
     :table      (some->> last-model (keyword "model") t2/table-name)
     :error      error-type}))

(defn- entity-reference
  "Describes the entity at `path` as `{:model :id :name}` for use in user-facing error messages.
  `:name` is nil for models whose name is absent or not a plain string (e.g. Settings, templated Card names)."
  [path ingested]
  (let [self (last path)]
    {:model (:model self)
     :id    (:id self)
     :name  (when (string? (:name ingested))
              (:name ingested))}))

(defn- rethrow-with-referrer
  "Always throws. Rethrows `e` with `referrer` attached when it is a `::not-found` error that does not name one yet,
  and unchanged otherwise.

  Only the nearest enclosing [[load-one!]] attaches itself, since it unwinds first and later frames see the key
  already present. The replacement inherits `e`'s cause rather than nesting `e` beneath itself: error reporting
  renders the whole cause chain, so nesting would print the same message twice joined by `caused by:`."
  [e referrer]
  (let [data (ex-data e)]
    (if (and (= ::not-found (:error data))
             (not (contains? data :referrer)))
      (throw (ex-info (ex-message e) (assoc data :referrer referrer) (ex-cause e)))
      (throw e))))

(defn- valid-model-name-for-load? [model-name]
  ;; linear scan, but small n
  (->> (concat serdes.models/inlined-models
               serdes.models/exported-models)
       (some #{model-name})
       boolean))

(defn- exported-with-entity-id?
  "Returns true if entities with the given model-name should have been exported with an entity_id."
  [model-name]
  (when (valid-model-name-for-load? model-name)
    (let [model (t2.model/resolve-model (symbol model-name))]
      (serdes.backfill/has-entity-id? model))))

(defn- load-one!
  "Loads a single entity, specified by its `:serdes/meta` abstract path, into the appdb, doing some bookkeeping to
  avoid cycles.

  If the incoming entity has any dependencies, they are recursively processed first (postorder) so that any foreign
  key references in this entity can be resolved properly.

  This is mostly bookkeeping for the overall deserialization process - the actual load of any given entity is done by
  [[metabase.models.serialization/load-one!]] and its various overridable parts, which see.

  The only tangling stuff is handling circular dependencies: parts of this is handled by the `serdes/load-one!`
  function, just outright skipping processing for parts of ingested data."
  [{:keys [expanding seen circular ingestion] :as ctx} path]
  (log/debug "Requested" (cond-> {:path (serdes/log-path-str path)}
                           (circular path) (assoc :stripped true)))
  (cond
    (and (expanding path)
         (circular path)) (throw (ex-info (format "Circular dependency on %s" (serdes/log-path-str path))
                                          (path-error-data ::circular expanding path)))
    (expanding path)      (do
                            (log/debug "Detected circular dependency" (serdes/log-path-str path))
                            (load-one! (-> ctx
                                           (update :expanding disj path)
                                           (update :circular conj path))
                                       path))
    (seen path)           ctx           ; Already been done, can skip it.
    :else
    (let [ingested (serdes.ingest/ingest-one ingestion path)]
      (if-not ingested
        (do
          (when-not (serdes/load-find-local path)
            (let [missing (last path)
                  model (:model missing)
                  id    (:id missing)]
              (throw (ex-info (format "%s '%s' was not found" model id)
                              {:path  (serdes/log-path-str path)
                               :model model
                               :id    id
                               :error ::not-found}))))
          (log/debug "Local" {:path (serdes/log-path-str path)})
          ctx)
        (let [_                  (log/trace "Loading" (cond-> {:path (serdes/log-path-str path)}
                                                        (circular path) (assoc :stripped true)))
              ;; Use the abstract path as attached by the ingestion process, not the original one we were passed.
              rebuilt-path       (serdes/path ingested)
              ;; If nil or absent :entity_id is taken as a signal to create a new entity
              ;; To get a nil entity_id, a user has to manually set the entity_id to null or remove it
              ;; in the yaml file.
              ;; In all other cases we should expect an :entity_id:
              ;; - exported entities have a :entity_id for every model that can have one
              ;; - backfill (pre import) guarantees all entities have ids in the appdb
              expect-entity-id   (some-> rebuilt-path peek :model exported-with-entity-id?)
              require-new-entity (and expect-entity-id (nil? (:entity_id ingested)))
              ingested           (cond-> ingested
                                   require-new-entity (assoc :entity_id (u/generate-nano-id))
                                   ;; `::strip` is handled in `metabase.serialization`
                                   (circular path)    (assoc ::serdes/strip (keys-to-strip ingested)))
              ;; we need less deps when trying to load "stripped" data
              deps               (->> (serdes/deserialization-dependencies (apply dissoc ingested (::serdes/strip ingested)))
                                      (remove seen))
              _                  (when (seq deps)
                                   (log/debug "Loading dependencies"
                                              {:entity_id (:entity_id ingested)
                                               :level     (count expanding)
                                               :deps      (str "[" (str/join ", " (map serdes/log-path-str deps)) "]")}))
              ctx                (try
                                   (-> ctx
                                       (update :expanding conj path)
                                       (load-deps! deps)
                                       (update :seen conj path)
                                       (update :expanding disj path))
                                   (catch Exception e
                                     (rethrow-with-referrer e (entity-reference rebuilt-path ingested))))
              _                  (when (seq deps)
                                   (log/debug "Ended loading dependencies" {:entity_id (:entity_id ingested)
                                                                            :level     (count expanding)}))
              local-or-nil       (when-not require-new-entity (serdes/load-find-local rebuilt-path))
              ;; content branching: scope entity resolution to (entity_id, branch) and stamp
              ;; :branch on the loaded row; identity outside a branch context
              [ingested
               local-or-nil]     (remote-sync.branching/serdes-load-target
                                  (:model (peek rebuilt-path)) ingested local-or-nil)]
          (try
            (with-retries 3 200
              (fn []
                (t2/with-transaction [_tx]
                  (let [result (serdes/load-one! ingested local-or-nil)]
                    ;; content branching: persist branch membership post-load
                    (remote-sync.branching/stamp-loaded-row! (:model (peek rebuilt-path)) result)
                    result))))
            ctx
            (catch Exception e
              ;; if the entity was part of a dependency loop, a stripped version of it may already be committed; with
              ;; continue-on-error that stripped row survives the import, so leave a breadcrumb in the error
              (let [stripped? (contains? (:circular ctx) path)]
                ;; ugly mapv here to convert #ordered/map into normal map so it's readable in the logs
                (throw (ex-info (format "Failed to load into database for %s%s"
                                        (serdes/log-path-str path)
                                        (if stripped?
                                          (format " (it may have been left without these keys, which were stripped to break a circular dependency: %s)"
                                                  (str/join ", " (sort (map name (keys-to-strip ingested)))))
                                          ""))
                                (-> (path-error-data ::load-failure expanding path)
                                    (assoc :entity (entity-reference rebuilt-path ingested))
                                    (cond-> stripped? (assoc :stripped-keys (keys-to-strip ingested))))
                                e))))))))))

(defn new-context
  "Given an ingestion create a new context for serialization.

  Arguments:
    ingestion: Ingestable instance

  Returns:
    an empty context object that can be passed to load-one!
  "
  [ingestion]
  {:expanding #{}
   :seen      #{}
   :circular  #{}
   :ingestion ingestion
   :errors    []})

(defn load-metabase!
  "Loads in a database export from an ingestion source, which is any Ingestable instance."
  [ingestion & {:keys [backfill? continue-on-error reindex?]
                :or   {backfill?         true
                       continue-on-error false
                       reindex?          true}}]
  (u/prog1
    ;; Each entity is loaded in its own transaction (inside load-one!), so a deadlock or transient
    ;; failure on one entity doesn't abort the entire import. See #74412.
    (do
      (when backfill?
        (t2/with-transaction [_tx]
          (serdes.backfill/backfill-ids!)))
      ;; We proceed in the arbitrary order of ingest-list, deserializing all the files. Their declared
      ;; dependencies guide the import, and make sure all containers are imported before contents, etc.
      (let [contents      (serdes.ingest/ingest-list ingestion)
            ingest-errors (serdes.ingest/ingest-errors ingestion)
            ctx           (cond-> (new-context ingestion)
                            (seq ingest-errors) (update :errors into ingest-errors))]
        (when (and (seq ingest-errors) (not continue-on-error))
          (let [file-names (mapv #(or (:file (ex-data %)) (ex-message %)) ingest-errors)]
            (throw (ex-info (format "Failed to read %d file(s) during ingestion: %s"
                                    (count ingest-errors)
                                    (str/join ", " file-names))
                            {:ingest-errors ingest-errors
                             :files         file-names}
                            (first ingest-errors)))))
        (log/infof "Starting deserialization, total %s documents" (count contents))
        (reduce (fn [ctx item]
                  (try
                    (load-one! ctx item)
                    (catch Exception e
                      (when-not continue-on-error
                        (throw e))
                      ;; eschew big and scary stacktrace
                      (log/warnf (u/strip-error e "Skipping deserialization error"))
                      (update ctx :errors conj e))))
                ctx
                contents)))
    (when reindex?
      ;; Reindex after all entities are loaded. Individual entity commits may have produced stale
      ;; search index entries; this ensures the index reflects the final state.
      (search/reindex!))))
