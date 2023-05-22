(ns metabase-enterprise.serialization.v2.load
  "Loading is the interesting part of deserialization: integrating the maps \"ingested\" from files into the appdb.
  See the detailed breakdown of the (de)serialization processes in [[metabase.models.serialization.base]]."
  (:require
   [medley.core :as m]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.ingest :as serdes.ingest]
   [metabase.models.serialization :as serdes]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]))

(declare load-one)

(defn- load-deps
  "Given a list of `deps` (hierarchies), [[load-one]] them all.
  If [[load-one]] throws because it can't find that entity in the filesystem, check if it's already loaded in
  our database."
  [ctx deps]
  (if (empty? deps)
    ctx
    (letfn [(loader [ctx dep]
              (try
                (load-one ctx dep)
                (catch Exception e
                  (if (and (= (:error (ex-data e)) ::not-found)
                           (serdes/load-find-local dep))
                    ;; It was missing but we found it locally, so just return the context.
                    ctx
                    ;; Different error, or couldn't find it locally, so rethrow.
                    (throw e)))))]
      (reduce loader ctx deps))))

(defn- load-one
  "Loads a single entity, specified by its `:serdes/meta` abstract path, into the appdb, doing some bookkeeping to avoid
  cycles.

  If the incoming entity has any dependencies, they are recursively processed first (postorder) so that any foreign key
  references in this entity can be resolved properly.

  This is mostly bookkeeping for the overall deserialization process - the actual load of any given entity is done by
  [[metabase.models.serialization.base/load-one!]] and its various overridable parts, which see.

  Circular dependencies are not allowed, and are detected and thrown as an error."
  [{:keys [expanding ingestion seen] :as ctx} path]
  (log/info (trs "Loading {0}" (serdes/log-path-str path)))
  (cond
    (expanding path) (throw (ex-info (format "Circular dependency on %s" (pr-str path)) {:path path}))
    (seen path) ctx ; Already been done, just skip it.
    :else (let [ingested (try
                           (serdes.ingest/ingest-one ingestion path)
                           (catch Exception e
                             (throw (ex-info (format "Failed to read file for %s" (pr-str path))
                                             {:path       path
                                              :deps-chain expanding
                                              :error      ::not-found}
                                             e))))
                deps     (serdes/dependencies ingested)
                ctx      (-> ctx
                             (update :expanding conj path)
                             (load-deps deps)
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

(defn- try-load-one
  [ctx path]
  (try
    (load-one ctx path)
    (catch Exception e
      (log/error (trs "Error importing {0}. Continuing..." (serdes/log-path-str path)))
      (update ctx :errors conj e))))

(defn load-metabase
  "Loads in a database export from an ingestion source, which is any Ingestable instance."
  [ingestion & {:keys [abort-on-error] :or {abort-on-error true}}]
  ;; We proceed in the arbitrary order of ingest-list, deserializing all the files. Their declared dependencies guide
  ;; the import, and make sure all containers are imported before contents, etc.
  (serdes.backfill/backfill-ids)
  (let [contents (serdes.ingest/ingest-list ingestion)
        ctx      {:expanding #{}
                  :seen      #{}
                  :ingestion ingestion
                  :from-ids  (m/index-by :id contents)
                  :errors    []}
        result   (reduce (if abort-on-error load-one try-load-one) ctx contents)]
    (when-let [errors (seq (:errors result))]
      (log/error (trs "Errors were encountered during import."))
      (doseq [e errors]
        (log/error e "Import error details:")))
    result))
