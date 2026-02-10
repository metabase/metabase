(ns metabase-enterprise.serialization.v2.load
  "Loading is the interesting part of deserialization: integrating the maps \"ingested\" from files into the appdb.
  See the detailed breakdown of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase-enterprise.serialization.v2.models :as serdes.models]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(declare load-one!)

(def ^:private model->circular-dependency-keys
  "Sometimes models have circular dependencies. For example, a card for a Dashboard Question has a `dashboard_id`
  pointing to the dashboard it's in. But when we try to load that dashboard, we'll create all its dashcards, and one
  of those dashcards will point to the card we started with.

  This map works around this: given a model (e.g. `Card`) that triggered a dependency loop, it provides a set of paths to
  keys to remove from the model so that we'll be able to successfully load it. You can remove keys in vectors using :* to
  indicate that all items in that vector should have a key removed."
  {"Dashboard" #{:dashcards}
   "Document"  #{:document}
   "Card"      #{:dashboard_id :document_id}})

(def ^:private ^:dynamic *warned-version-mismatch*
  "Used to avoid double-logging on version mismatches. Warns if nil or set to true"
  nil)

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
  (binding [*warned-version-mismatch* (if (nil? *warned-version-mismatch*) (atom false) *warned-version-mismatch*)]
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
        (reduce loader ctx deps)))))

(defn- path-error-data [error-type expanding path]
  (let [last-model (:model (last path))]
    {:path       (mapv (partial into {}) path)
     :local-id   (when-let [entity (serdes/load-find-local path)]
                   ((t2/select-pks-fn entity) entity))
     :deps-chain expanding
     :model      last-model
     :table      (some->> last-model (keyword "model") t2/table-name)
     :error      error-type}))

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

(defn- warn-if-version-mismatch
  "Checks if the version in the exported entity's serdes/meta differs from the current Metabase version.
  Logs a warning if there is a mismatch."
  [ingested path]
  (when (or (nil? *warned-version-mismatch*) (not @*warned-version-mismatch*))
    (let [current-version config/mb-version-string
          exported-version (or (:metabase_version ingested) "UNKNOWN")]
      (when (not= exported-version current-version)
        (log/warnf "Version mismatch loading %s: exported with: %s, current version: %s"
                   path
                   exported-version
                   current-version)
        (when (not (nil? *warned-version-mismatch*))
          (reset! *warned-version-mismatch* true))))))

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
            (throw (ex-info "Failed to read file" {:path (serdes/log-path-str path)})))
          (log/debug "Local" {:path (serdes/log-path-str path)})
          ctx)
        (let [_                  (log/info "Loading" (cond-> {:path (serdes/log-path-str path)}
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
              deps               (->> (serdes/dependencies (apply dissoc ingested (::serdes/strip ingested)))
                                      (remove seen))
              _                  (when (seq deps)
                                   (log/debug "Loading dependencies"
                                              {:entity_id (:entity_id ingested)
                                               :level     (count expanding)
                                               :deps      (str "[" (str/join ", " (map serdes/log-path-str deps)) "]")}))
              ctx                (-> ctx
                                     (update :expanding conj path)
                                     (load-deps! deps)
                                     (update :seen conj path)
                                     (update :expanding disj path))
              _                  (when (seq deps)
                                   (log/debug "Ended loading dependencies" {:entity_id (:entity_id ingested)
                                                                            :level     (count expanding)}))
              local-or-nil       (when-not require-new-entity (serdes/load-find-local rebuilt-path))]
          (try
            (warn-if-version-mismatch ingested path)
            (serdes/load-one! ingested local-or-nil)
            ctx
            (catch Exception e
              ;; ugly mapv here to convert #ordered/map into normal map so it's readable in the logs
              (throw (ex-info (format "Failed to load into database for %s" (serdes/log-path-str path))
                              (path-error-data ::load-failure expanding path)
                              e)))))))))

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
   :from-ids  (->> ingestion serdes.ingest/ingest-list (m/index-by :id))
   :errors    []})

(defn load-metabase!
  "Loads in a database export from an ingestion source, which is any Ingestable instance."
  [ingestion & {:keys [backfill? continue-on-error reindex?]
                :or   {backfill?         true
                       continue-on-error false
                       reindex?          true}}]
  (binding [*warned-version-mismatch* (atom false)]
    (u/prog1
      (t2/with-transaction [_tx]
        ;; We proceed in the arbitrary order of ingest-list, deserializing all the files. Their declared dependencies
        ;; guide the import, and make sure all containers are imported before contents, etc.
        (when backfill?
          (serdes.backfill/backfill-ids!))
        (let [contents (serdes.ingest/ingest-list ingestion)
              ctx (new-context ingestion)]
          (log/infof "Starting deserialization, total %s documents" (count contents))
          (reduce (fn [ctx item]
                    (when (Thread/interrupted)
                      (throw (InterruptedException. "Serialization import interrupted")))
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
      ;; Hack: the transaction above typically takes much longer than our delay on the search indexing queue.
      ;;       this means that the corresponding entries would have been missing or stale when we indexed them.
      ;;       ideally, we would delay the indexing somehow, or only reindex what we've loaded.
      ;;       while we're figuring that out, here's a crude stopgap.
        (search/reindex!)))))
