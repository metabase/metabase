(ns metabase-enterprise.serialization.v2.load
  "Loading is the interesting part of deserialization: integrating the maps \"ingested\" from files into the appdb.
  See the detailed breakdown of the (de)serialization processes in [[metabase.models.serialization]]."
  (:require
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(declare load-one!)

(defn- without-references
  "Remove references to other entities from a given one. Used to break circular dependencies when loading."
  [entity]
  (if (:dashcards entity)
    (dissoc entity :dashcards)
    (throw (ex-info "No known references found when breaking circular dependency!" {:entity entity}))))

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
                    ;; It was missing but we found it locally, so just return the context.
                    (and (= (:error (ex-data e)) ::not-found)
                         (serdes/load-find-local dep))
                    ctx

                    ;; It's a circular dep, strip off probable cause and retry. This will store an incomplete version
                    ;; of an entity, but this is not a problem - a full version is waiting to be stored up the stack.
                    (= (:error (ex-data e)) ::circular)
                    (do
                      (log/debug "Detected circular dependency" (serdes/log-path-str dep))
                      (load-one! (update ctx :expanding disj dep) dep without-references))

                    :else
                    (throw e)))))]
      (reduce loader ctx deps))))

(defn- load-one!
  "Loads a single entity, specified by its `:serdes/meta` abstract path, into the appdb, doing some bookkeeping to
  avoid cycles.

  If the incoming entity has any dependencies, they are recursively processed first (postorder) so that any foreign
  key references in this entity can be resolved properly.

  This is mostly bookkeeping for the overall deserialization process - the actual load of any given entity is done by
  [[metabase.models.serialization/load-one!]] and its various overridable parts, which see.

  Error is thrown on a circular dependency, should be handled and retried at the caller. `modfn` is an optional
  parameter to modify entity data after reading and before other processing (before loading dependencies, finding
  local version, and storing in the db)."
  [{:keys [expanding ingestion seen] :as ctx} path & [modfn]]
  (log/infof "Loading %s" (serdes/log-path-str path))
  (cond
    (expanding path) (throw (ex-info (format "Circular dependency on %s" (pr-str path)) {:path path
                                                                                         :error ::circular}))
    (seen path) ctx ; Already been done, just skip it.
    :else (let [ingested (try
                           (serdes.ingest/ingest-one ingestion path)
                           (catch Exception e
                             (throw (ex-info (format "Failed to read file for %s" (serdes/log-path-str path))
                                             {:path       path
                                              :deps-chain expanding
                                              :error      ::not-found}
                                             e))))
                ingested (cond-> ingested
                           modfn modfn)
                deps     (serdes/dependencies ingested)
                _        (log/debug "Loading dependencies" deps)
                ctx      (-> ctx
                             (update :expanding conj path)
                             (load-deps! deps)
                             (update :seen conj path)
                             (update :expanding disj path))
                ;; Use the abstract path as attached by the ingestion process, not the original one we were passed.
                rebuilt-path    (serdes/path ingested)
                local-or-nil    (serdes/load-find-local rebuilt-path)]
            (try
              (serdes/load-one! ingested local-or-nil)
              ctx
              (catch Exception e
                (throw (ex-info (format "Failed to load into database for %s" (pr-str path))
                                {:path       path
                                 :deps-chain expanding}
                                e)))))))

(defn load-metabase!
  "Loads in a database export from an ingestion source, which is any Ingestable instance."
  [ingestion & {:keys [backfill?]
                :or   {backfill? true}}]
  (t2/with-transaction [_tx]
    ;; We proceed in the arbitrary order of ingest-list, deserializing all the files. Their declared dependencies
    ;; guide the import, and make sure all containers are imported before contents, etc.
    (when backfill?
      (serdes.backfill/backfill-ids!))
    (let [contents (serdes.ingest/ingest-list ingestion)
          ctx      {:expanding #{}
                    :seen      #{}
                    :ingestion ingestion
                    :from-ids  (m/index-by :id contents)}]
      (log/infof "Starting deserialization, total %s documents" (count contents))
      (reduce load-one! ctx contents))))
