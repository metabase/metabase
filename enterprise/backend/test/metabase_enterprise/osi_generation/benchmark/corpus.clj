(ns metabase-enterprise.osi-generation.benchmark.corpus
  "Loads and materializes the version-controlled OSI-generation benchmark corpus.

  Three EDN files under `test_resources/osi_generation/benchmark/` are the reviewable artifact: the
  corpus entities (`corpus.edn`), the queries + relevance judgments (`queries.edn`), and the
  hand-written baseline `ai_context` (`baseline.edn`). They are split so a judgment change and a
  baseline change are each a reviewable diff; the authoring procedure (entities first, queries second,
  judgments third, baseline last) is recorded in the files' headers.

  [[load-corpus]] reads and validates them; [[with-corpus-library]] materializes the entities as appdb
  rows inside the benchmark's OWN collection tree. Membership isolation is an invariant: the tree is
  always freshly created (never a reused real library) and carries NO library
  collection type — it is a library only through the scoped `collections/library-collection` rebinding
  for the body, so every membership read — the reconcile's doc derivation, the tool's member
  post-filter, the generation candidates — sees only corpus entities, while a thread without the
  binding (a background scheduler) still resolves exactly the real library. A reviewer's real library
  is never enumerated, never embedded, and never confused with the benchmark tree."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(def default-dir
  "Classpath dir holding the three corpus EDN files (test_resources is on the test classpath)."
  "osi_generation/benchmark")

;;; --------------------------------------------------- Schema ----------------------------------------------------

(def CorpusSchema
  "Malli schema for the merged corpus (entities + queries + baseline), so a corpus edit fails
  [[corpus-validates-test]] rather than a run.
  Cross-file keys (every judged/baseline key resolves to an entity, unique corpus keys, measure/segment
  parents are tables) are structural and checked in [[load-corpus]], not here."
  [:map {:closed true}
   [:meta [:map {:closed true}
           [:schema-version :int]
           [:business :string]
           [:authored-by :string]
           [:notes :string]]]
   [:entities [:sequential
               [:map {:closed true}
                [:corpus-key :keyword]
                [:model [:enum :model/Table :model/Card :model/Measure :model/Segment]]
                ;; tables/cards live in a library collection; measures/segments hang off a corpus table.
                [:collection {:optional true} [:enum :data :metrics]]
                [:table {:optional true} :keyword]
                [:entity :map]]]]
   [:queries [:sequential
              [:map {:closed true}
               [:id :keyword]
               [:prompt :string]
               [:holdout :boolean]
               [:judged [:map-of :keyword [:enum 1 2]]]]]]
   [:baseline [:map-of :keyword :map]]])

(defn- read-edn [dir basename]
  (let [resource (io/resource (str dir "/" basename))]
    (when-not resource
      (throw (ex-info (str "Benchmark corpus file not found on classpath: " dir "/" basename)
                      {:dir dir :basename basename})))
    (edn/read-string (slurp resource))))

(defn- structural-problems
  "Cross-file consistency problems Malli can't express, as a map of problem -> offenders; {} when clean."
  [{:keys [entities queries baseline]}]
  (let [entity-keys (set (map :corpus-key entities))
        by-key      (m/index-by :corpus-key entities)]
    (->> {:duplicate-corpus-keys (keep (fn [[k n]] (when (< 1 n) k))
                                       (frequencies (map :corpus-key entities)))
          ;; bootstrap-delta indexes an arm by query :id, so a duplicate id would silently overwrite one
          ;; and mispair the paired-bootstrap deltas -- reject it rather than report a bogus regression signal.
          :duplicate-query-ids   (keep (fn [[k n]] (when (< 1 n) k))
                                       (frequencies (map :id queries)))
          :judged-key-unknown    (for [{:keys [id judged]} queries
                                       k                   (keys judged)
                                       :when               (not (entity-keys k))]
                                   [id k])
          :baseline-key-unknown  (remove entity-keys (keys baseline))
          :parent-not-a-table    (for [{:keys [corpus-key model table]} entities
                                       :when (#{:model/Measure :model/Segment} model)
                                       :when (not= :model/Table (:model (by-key table)))]
                                   corpus-key)
          :collection-missing    (for [{:keys [corpus-key model collection]} entities
                                       :when (#{:model/Table :model/Card} model)
                                       :when (nil? collection)]
                                   corpus-key)}
         (m/filter-vals seq)
         (m/map-vals vec))))

(defn load-corpus
  "Read and validate the corpus under `dir` (default [[default-dir]]), returning
  `{:entities [...] :queries [...] :baseline {...} :meta {...}}`.
  Throws on schema violation or a cross-file inconsistency (a judged or baseline key with no entity,
  duplicate corpus keys, a measure/segment whose `:table` is not a corpus table)."
  ([] (load-corpus default-dir))
  ([dir]
   (let [corpus (merge (read-edn dir "corpus.edn")
                       (read-edn dir "queries.edn")
                       (read-edn dir "baseline.edn"))]
     (when-let [explanation (mr/explain CorpusSchema corpus)]
       (throw (ex-info (str "Invalid benchmark corpus: " (pr-str (me/humanize explanation)))
                       {:errors (me/humanize explanation)})))
     (let [problems (structural-problems corpus)]
       (when (seq problems)
         (throw (ex-info (str "Inconsistent benchmark corpus: " (pr-str problems))
                         {:problems problems}))))
     corpus)))

;;; ------------------------------------------------ Content identity ---------------------------------------------

(defn canonical-edn
  "`value` with every map/set recursively sorted, so `pr-str` of it is one canonical text per content —
  the hashing basis for [[corpus-hash]] and the runner's snapshot sha."
  [value]
  (cond
    (map? value)        (into (sorted-map) (map (fn [[k v]] [k (canonical-edn v)])) value)
    (sequential? value) (mapv canonical-edn value)
    (set? value)        (into (sorted-set) (map canonical-edn) value)
    :else               value))

(defn canonical-pr-str
  "Stable, unlimited EDN text for hashing `value`. Explicit bindings keep an invoking REPL's print
  length, depth, metadata, and namespace-map preferences out of artifact identity."
  [value]
  (binding [*print-dup*           false
            *print-length*        nil
            *print-level*         nil
            *print-meta*          false
            *print-readably*      true
            *print-namespace-maps* false]
    (pr-str (canonical-edn value))))

(defn corpus-hash
  "Content identity of the corpus half that feeds generation — the `:entities` (names, descriptions,
  fields). `capture-generated!` stamps it into a snapshot's metadata and the runner refuses a snapshot
  whose recorded hash differs from the loaded corpus, so a snapshot captured before a corpus edit still
  has full key coverage but can never be scored as if it covered the edited corpus."
  [corpus]
  (-> (:entities corpus) canonical-pr-str buddy-hash/sha256 codecs/bytes->hex))

;;; ------------------------------------------------ Materialization ----------------------------------------------

(defn- create-rows!
  "Create `specs` in order with `with-temp` semantics (defaults, cleanup on unwind), threading a context
  map of what exists so far, and call `f` with the final context.
  A spec is `{:model _ :attrs (fn [ctx] attrs)}` plus `:corpus-key` (registers the instance under
  `[:instances corpus-key]`) or `:field-of` (registers a Field id under `[:fields table-key name]`)."
  [specs ctx f]
  (if (empty? specs)
    (f ctx)
    (let [[{:keys [model corpus-key field-of attrs]} & more] specs]
      (t2.with-temp/do-with-temp
       model (attrs ctx)
       (fn [instance]
         (create-rows! more
                       (cond
                         corpus-key (assoc-in ctx [:instances corpus-key] instance)
                         field-of   (assoc-in ctx [:fields field-of (:name instance)] (:id instance))
                         :else      ctx)
                       f))))))

(defn- measure-definition [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    (lib/aggregate (lib/query mp (lib.metadata/table mp table-id))
                   (lib/sum (lib.metadata/field mp field-id)))))

(defn- segment-definition [db-id table-id field-id value]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                (lib/> (lib.metadata/field mp field-id) value))))

(defn- table-field
  "Resolve one of `table-key`'s created Field ids by name, for a measure/segment definition."
  [ctx table-key field-name]
  (or (get-in ctx [:fields table-key field-name])
      (throw (ex-info (str "Corpus references unknown field " (pr-str field-name)
                           " on table " table-key)
                      {:table table-key :field field-name}))))

(defn- entity-specs
  "The ordered [[create-rows!]] specs for `corpus`: tables, their fields, cards, then measures/segments
  (whose MBQL5 definitions need the created table/field ids)."
  [corpus db-id coll-ids]
  (let [{tables   :model/Table
         cards    :model/Card
         measures :model/Measure
         segments :model/Segment} (group-by :model (:entities corpus))
        parent-id (fn [ctx table-key] (:id (get-in ctx [:instances table-key])))]
    (concat
     (for [{:keys [corpus-key collection entity]} tables]
       {:model      :model/Table
        :corpus-key corpus-key
        :attrs      (constantly (merge (dissoc entity :fields)
                                       {:db_id         db-id
                                        :collection_id (coll-ids collection)
                                        :is_published  true
                                        :active        true}))})
     (for [{:keys [corpus-key entity]} tables
           field                       (:fields entity)]
       {:model    :model/Field
        :field-of corpus-key
        :attrs    (fn [ctx] (assoc field :table_id (parent-id ctx corpus-key)))})
     (for [{:keys [corpus-key collection entity]} cards]
       {:model      :model/Card
        :corpus-key corpus-key
        :attrs      (constantly (merge entity
                                       {:collection_id (coll-ids collection)
                                        :database_id   db-id
                                        :archived      false}))})
     (for [{:keys [corpus-key table entity]} measures]
       {:model      :model/Measure
        :corpus-key corpus-key
        :attrs      (fn [ctx]
                      (let [table-id (parent-id ctx table)]
                        {:name        (:name entity)
                         :description (:description entity)
                         :table_id    table-id
                         :creator_id  (mt/user->id :crowberto)
                         :definition  (measure-definition
                                       db-id table-id
                                       (table-field ctx table (:aggregate-field entity)))}))})
     (for [{:keys [corpus-key table entity]} segments]
       {:model      :model/Segment
        :corpus-key corpus-key
        :attrs      (fn [ctx]
                      (let [table-id (parent-id ctx table)]
                        {:name        (:name entity)
                         :description (:description entity)
                         :table_id    table-id
                         :definition  (segment-definition
                                       db-id table-id
                                       (table-field ctx table (:filter-field entity))
                                       (:filter-value entity))}))}))))

(defn- corpus-ids
  "`{corpus-key -> {:entity_type _ :entity_local_id _}}` for the created instances — a Card's type is
  its live flavor (metric/model), the way `spec/member-entities` reports it."
  [corpus ctx]
  (into {}
        (map (fn [{:keys [corpus-key model entity]}]
               [corpus-key {:entity_type     (case model
                                               :model/Table   "table"
                                               :model/Card    (:type entity)
                                               :model/Measure "measure"
                                               :model/Segment "segment")
                            :entity_local_id (:id (get-in ctx [:instances corpus-key]))}]))
        (:entities corpus)))

(defn- delete-corpus-ai-context!
  "Delete any `osi_ai_context` rows written against the corpus entities (the arm writers create them
  outside with-temp, so the materializer owns their cleanup)."
  [ids]
  (doseq [{:keys [entity_type entity_local_id]} (vals ids)]
    (t2/delete! :model/OsiAiContext
                :entity_type (entity-retrieval/normalize-entity-type entity_type)
                :entity_local_id entity_local_id)))

(defn do-with-corpus-library
  "Function impl of [[with-corpus-library]]."
  [corpus f]
  (mt/initialize-if-needed! :db :test-users)
  ;; Ordinary (untyped) collections, deliberately: `library-collection` discovers THE library root by a
  ;; select-one on collection type, so a second library-typed root would be visible to every thread
  ;; WITHOUT this scope's rebinding — a scheduled full reconcile on a background thread could then
  ;; enumerate the benchmark tree as the library and write corpus docs into the real index. The tree is
  ;; a library only through the scoped rebinding below; membership resolves the rest by location
  ;; (root + descendants), so no collection needs a library type
  ;; (corpus-library-invisible-without-override-test pins this).
  ;; A benchmark must commit LLM and embedding usage written inside this scope. Disable with-temp's
  ;; rollback-only test transaction and let its ordinary cleanup remove just the corpus rows.
  ;; Writing or deleting an `osi_ai_context` row nudges the real index on commit. Suppress that for the
  ;; whole scope — body and teardown alike — so a benchmark run can never reconcile the synthetic corpus
  ;; into a reviewer's index or call the real embedder. This has to live here rather than in the runner:
  ;; every caller of `with-corpus-library` writes rows.
  (mt/with-dynamic-fn-redefs [mirror/request-entity-sync! (fn [& _] nil)
                              ;; The corpus commits real Tables, Cards, Measures and Segments, so the
                              ;; ordinary search-index hooks fire too. Left alone they would ingest synthetic
                              ;; rows into a reviewer's real search index — calling the configured embedder on
                              ;; the way — and teardown removes the appdb rows, not the index entries.
                              search/update!               (fn [& _] nil)]
    (binding [tu.thread-local/*thread-local* false]
      (mt/with-temp [:model/Collection library {:name     "OSI Benchmark Library"
                                                :location "/"}
                     :model/Collection data    {:name     "Benchmark Data"
                                                :location (str "/" (:id library) "/")}
                     :model/Collection metrics {:name     "Benchmark Metrics"
                                                :location (str "/" (:id library) "/")}
                     ;; Metadata-only: never register sync/analyze schedules for the synthetic H2 database.
                     :model/Database   db      {:name "osi-generation-benchmark" :is_stub true}]
        ;; Rebind membership's root lookup to the benchmark tree: with a second (real) library present the
        ;; real one leaking in would embed non-corpus metadata.
        ;; The placement check is bypassed for construction only: corpus tables live in an untyped temp
        ;; collection (the live check requires a library-data one), and the live write path has no placement
        ;; for a library model card yet, but membership declares models and serdes/direct writes produce
        ;; them, so the corpus includes one (same precedent as spec-equivalence-test's fixture corpus).
        (mt/with-dynamic-fn-redefs [collections/library-collection    (fn [] library)
                                    collection/check-allowed-content (constantly true)]
          (create-rows! (entity-specs corpus (:id db) {:data (:id data) :metrics (:id metrics)})
                        {}
                        (fn [ctx]
                          (let [ids (corpus-ids corpus ctx)]
                            (try
                              (f ids)
                              (finally
                                (delete-corpus-ai-context! ids)))))))))))

(defmacro with-corpus-library
  "Materialize `corpus`'s entities as appdb rows inside a fresh, membership-isolated library collection
  tree for the duration of `body`, binding `ids-sym` to `{corpus-key -> {:entity_type :entity_local_id}}`.
  Everything — entities, the tree, and any `osi_ai_context` rows written against corpus entities — is
  torn down on exit. LLM and embedding usage written during `body` remains committed. Requires a test
  appdb (uses `mt/with-temp` with explicit cleanup instead of its rollback-only transaction)."
  {:style/indent 1}
  [[ids-sym corpus] & body]
  `(do-with-corpus-library ~corpus (fn [~ids-sym] ~@body)))
