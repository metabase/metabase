(ns metabase-enterprise.curated-search.reconcile
  "Reconciles the pgvector `library_entity_index` with the authoritative appdb.

  The index holds one embedded document per library-entity value — the entity's name, its description, and
  each `ai_context` synonym/example.
  The primary key `doc_id` is content-addressed over `entity_type|entity_local_id|doc_type|doc_text`, so
  editing text mints a new row.
  Curator `instructions` are not stored here — the tool reads them live from `osi_ai_context` at query time.

  Each run derives the full desired doc set from library membership (published Tables, library
  metric/model Cards, and the Measures/Segments on those Tables) plus `osi_ai_context`, then inserts docs
  whose `doc_id` is absent (embedding them) and deletes docs with no desired counterpart.
  That delete is the GC: an entity leaving the library, a removed synonym/example, and the stale half of
  an edited value all converge there.
  Re-deriving from the appdb every run self-heals any missed write (pgvector downtime, a crashed node, an
  import that bypassed the model hooks).

  Runs from the [[metabase-enterprise.curated-search.task.sync]] Quartz job; callers pass the datasource
  and embedding model, so this namespace reads no settings."
  (:require
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.curated-search.index-table :as index-table]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.collections.core :as collections]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private embed-batch-size
  "Documents embedded per embedding-service request while backfilling new index rows.
  Matches semantic-search's indexer batch default ([[metabase-enterprise.semantic-search.index/*batch-size*]]);
  our docs are short (names, single synonyms/examples), so item count, not tokens, is the binding limit."
  150)

;; Advisory lock serializing whole reconcile runs across cluster nodes (insert-vs-orphan-delete races).
;; Arbitrary app-wide-unique constant, distinct from index-table's ensure lock (20011) and
;; semantic-search's migration lock (19991).
(def ^:private reconcile-lock-id 20012)

(defn doc-id
  "Content-addressed primary key for an index document.
  `instructions` is intentionally not an input: editing it must not re-embed an entity's name/synonyms."
  [entity-type entity-local-id doc-type doc-text]
  (u/encode-base64-bytes
   (buddy-hash/sha1 (str entity-type "|" entity-local-id "|" doc-type "|" doc-text))))

;;; ------------------------------------------------- Desired docs -------------------------------------------------

(defn- make-doc [entity-type entity-local-id doc-type doc-text]
  {:doc_id          (doc-id entity-type entity-local-id doc-type doc-text)
   :entity_type     entity-type
   :entity_local_id entity-local-id
   :doc_type        doc-type
   :doc_text        doc-text})

(defn- entity->docs
  "All desired docs for one library entity: a `name` doc (always), a `description` doc (non-blank), and a
  `synonym`/`example` doc per `ai_context` value.
  Instructions are not indexed — the tool reads them live from `osi_ai_context`."
  [{:keys [entity_type entity_local_id name description]} ai_context]
  (let [doc #(make-doc entity_type entity_local_id %1 %2)]
    (concat
     [(doc "name" name)]
     (when-not (str/blank? description) [(doc "description" description)])
     (for [s (:synonyms ai_context) :when (not (str/blank? s))] (doc "synonym" s))
     (for [e (:examples ai_context) :when (not (str/blank? e))] (doc "example" e)))))

(defn- ->library-entity [entity-type id nm description]
  {:entity_type     entity-type
   :entity_local_id id
   :name            nm
   :description      description})

(defn- library-entities
  "Uniform `{:entity_type :entity_local_id :name :description}` maps for every entity in the library."
  []
  ;; Headless: the reconcile job runs with no current user, so these selects must NOT permission-filter.
  (when-let [lib (collections/library-collection)]
    (when-let [lib-ids (not-empty (collections/descendant-ids lib))]
      (let [;; :card_schema is mandatory in any column-scoped Card SELECT (toucan guard).
            cards     (t2/select [:model/Card :id :name :description :type :card_schema]
                                 :collection_id [:in lib-ids] :archived false
                                 :type [:in ["metric" "model"]])
            tables    (t2/select [:model/Table :id :name :display_name :description]
                                 :collection_id [:in lib-ids] :is_published true :active true)
            table-ids (not-empty (set (map :id tables)))
            measures  (when table-ids
                        (t2/select [:model/Measure :id :name :description]
                                   :table_id [:in table-ids] :archived false))
            segments  (when table-ids
                        (t2/select [:model/Segment :id :name :description]
                                   :table_id [:in table-ids] :archived false))]
        (concat
         ;; Card :type is keywordized (:metric / :model); the ref model string is its name.
         (map (fn [c] (->library-entity (name (:type c)) (:id c) (:name c) (:description c))) cards)
         ;; A published table's user-facing label is its display_name; fall back to the raw name.
         (map (fn [t] (->library-entity "table" (:id t) (or (:display_name t) (:name t)) (:description t))) tables)
         (map (fn [m] (->library-entity "measure" (:id m) (:name m) (:description m))) measures)
         (map (fn [s] (->library-entity "segment" (:id s) (:name s) (:description s))) segments))))))

(defn- ai-context-by-entity
  "Map of `[entity_type entity_local_id] -> ai_context` for every `osi_ai_context` row."
  []
  (u/index-by (fn [{e :entity}] [(:model e) (:id e)]) :ai_context
              (t2/select [:model/OsiAiContext :entity :ai_context])))

(defn- desired-docs
  "The full set of docs the index should hold, deduped by `doc_id` (identical values collapse to one)."
  []
  (let [ac-by-entity (ai-context-by-entity)]
    ;; key by doc_id so an exact duplicate (same doc_type and text, e.g. a synonym listed twice) collapses.
    ;; a synonym equal to the name does NOT collapse — different doc_type, different doc_id.
    (vals (into {}
                (comp (mapcat (fn [{:keys [entity_type entity_local_id] :as ent}]
                                (entity->docs ent (get ac-by-entity [entity_type entity_local_id]))))
                      (map (juxt :doc_id identity)))
                (library-entities)))))

;;; ------------------------------------------------- Index writes -------------------------------------------------

(defn- stored-docs
  "Map of `doc_id -> {:entity_type :entity_local_id}` for every row in the index."
  [pgvector]
  (u/index-by :doc_id #(select-keys % [:entity_type :entity_local_id])
              (jdbc/execute! pgvector
                             [(format "SELECT doc_id, entity_type, entity_local_id FROM \"%s\""
                                      index-table/*vectors-table*)]
                             {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(defn- doc->record [doc embedding]
  {:doc_id          (:doc_id doc)
   :entity_type     (:entity_type doc)
   :entity_local_id (:entity_local_id doc)
   :doc_type        (:doc_type doc)
   :doc_text        (:doc_text doc)
   :doc_embedding   [:raw (index-table/format-embedding embedding)]})

(defn insert-batch!
  "Embed one batch of new docs and insert them. Returns the number inserted.
  Public only as a test seam for simulating embed/insert failure."
  [pgvector embedding-model docs]
  (let [embeddings (embedding/get-embeddings-batch embedding-model (map :doc_text docs)
                                                   {:type :index :record-tokens? true})
        records    (map doc->record docs embeddings)]
    (jdbc/execute! pgvector
                   (-> (sql.helpers/insert-into (keyword index-table/*vectors-table*))
                       (sql.helpers/values (vec records))
                       (sql.helpers/on-conflict :doc_id)
                       (sql.helpers/do-nothing)
                       (sql/format {:quoted true})))
    (count docs)))

(defn- delete-rows! [pgvector doc-ids]
  (when (seq doc-ids)
    (jdbc/execute! pgvector
                   (-> (sql.helpers/delete-from (keyword index-table/*vectors-table*))
                       (sql.helpers/where [:in :doc_id (vec doc-ids)])
                       (sql/format {:quoted true})))))

(defn- entity-class
  "Equivalence class of a row's entity, used to match orphans to failed inserts.
  Collapses a Card's interchangeable type labels (metric/model) so a type flip still matches the same
  entity; table/measure/segment stay distinct, so a same-id entity of another type is never confused."
  [{:keys [entity_type entity_local_id]}]
  [(if (#{"metric" "model"} entity_type) :card entity_type) entity_local_id])

;; Scalability — full-diff now, incremental later.
;; The diff is O(total index size) per run, not O(changes), and that is deliberate. Embeddings — the only
;; expensive resource — are already change-scoped (only a new doc_text is embedded; an idle run embeds
;; nothing). The O(total) work is cheap metadata bookkeeping over the *library* (the bounded curated tier),
;; never the whole instance, so it stays comfortable into the tens of thousands of docs. Mark-and-sweep
;; (stamp a generation, DELETE WHERE gen < current) would be a net loss: it trades the cheap full read for a
;; full write every run (WAL, dead tuples, vacuum pressure) while the real cost is already incremental.
;;
;; TODO (Chris 2026-06-24) -- if a library ever outgrows full-diff, switch to event/watermark
;; incrementality: reconcile only the changed entity's doc slice (the appdb write already nudges this job),
;; with an updated_at watermark for membership changes and a periodic full reconcile as the backstop. Needs
;; a (entity_type, entity_local_id) index and reliable change capture; build it behind this same reconcile!
;; interface only when data demands it.
(defn- reconcile-against-appdb!
  "The diff body — assumes the reconcile advisory lock is held. See the namespace docstring."
  [pgvector embedding-model]
  (let [desired       (desired-docs)
        desired-ids   (set (map :doc_id desired))
        stored        (stored-docs pgvector)
        to-insert     (remove #(contains? stored (:doc_id %)) desired)
        orphans       (remove desired-ids (keys stored))
        ;; entity classes whose insert failed this run — their orphans are spared (see below).
        failed        (volatile! #{})
        inserted      (transduce
                       (partition-all embed-batch-size)
                       (completing
                        (fn [n batch]
                          (+ n (try
                                 (insert-batch! pgvector embedding-model batch)
                                 (catch Exception e
                                   (vswap! failed into (map entity-class batch))
                                   (log/error e "library entity index: failed to insert batch of"
                                              (count batch) "docs; will retry next run")
                                   0)))))
                       0
                       to-insert)
        ;; An orphan is often the stale half of an edited value (e.g. a renamed name's old doc).
        ;; Deleting it while its replacement failed to embed would drop that entity from search until the
        ;; next run, so spare orphans whose entity class had a failed insert; every other orphan GCs normally.
        to-delete     (cond->> orphans
                        (seq @failed) (remove #(contains? @failed (entity-class (get stored %)))))]
    (delete-rows! pgvector to-delete)
    {:inserted  inserted
     :deleted   (count to-delete)
     :unchanged (- (count desired) (count to-insert))}))

(defn reconcile!
  "Bring the pgvector `library_entity_index` in line with the appdb; see the namespace docstring.
  Serialized across nodes with a pg advisory lock — if another node is already reconciling, this run is
  skipped (the periodic schedule covers it). Returns {:inserted n :deleted n :unchanged n},
  or {:skipped true} when the lock is contended."
  [pgvector embedding-model]
  (index-table/ensure-tables! pgvector embedding-model)
  (with-open [conn (jdbc/get-connection pgvector)]
    (if-not (:pg_try_advisory_lock
             (jdbc/execute-one! conn [(format "SELECT pg_try_advisory_lock(%d)" reconcile-lock-id)]
                                {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
      (do (log/info "library entity index: another node holds the reconcile lock; skipping this run")
          {:skipped true})
      (try
        (reconcile-against-appdb! pgvector embedding-model)
        (finally
          (jdbc/execute! conn [(format "SELECT pg_advisory_unlock(%d)" reconcile-lock-id)]))))))
