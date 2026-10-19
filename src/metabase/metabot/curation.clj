(ns metabase.metabot.curation
  "Source-of-truth curation checks for Metabot: the recent-view context, and the tools that must stay within curated
  content when a Metabot has `use_verified_content` on (see [[curated-only?]]).
  Reads each item's curation signals straight from the source tables and applies the canonical
  [[metabase.collections.curation/curated?]] predicate, so it has no dependency on the search index being
  present, fresh, or complete, and can't drift from the rule.
  Lives in metabot rather than collections.curation because it reads cards/dashboards/tables/reviews, which
  are higher-level models a foundational module shouldn't reference; a consistency test pins it to the
  index's precomputed `curated` column."
  (:require
   [clojure.set :as set]
   [metabase.audit-app.core :as audit-app]
   [metabase.collections.curation :as curation]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ----- Session -----

(def curation-exempt-profiles
  "Profiles whose tools aren't restricted by `use_verified_content`. The nlq profile discovers data through the
  Library index, which carries its own scope; `nlq-fallback` serves the same profile with general search."
  #{:nlq :nlq-fallback})

(defn curated-only?
  "Whether a Metabot tool running for the Metabot row `metabot` under `profile-id` may only reach curated content:
  the Metabot has `use_verified_content` on and the profile isn't in [[curation-exempt-profiles]]."
  [metabot profile-id]
  (boolean
   (and (:use_verified_content metabot)
        (not (contains? curation-exempt-profiles (some-> profile-id name keyword))))))

;;; ----- Curation signals -----

(def ^:private report-card-models
  "Search-model strings backed by `report_card`, moderated as \"card\"."
  #{"card" "dataset" "metric"})

(defn- feature-gates
  "Which curation signals the licence currently grants. The signals are read live from the source tables, where a
  review, an official collection, or a Library stays after a downgrade, so each one counts only while its feature
  is active, as in [[metabot.db/metabot-metrics-and-models]] and the in-place search filter."
  []
  {:verified? (premium-features/has-feature? :content-verification)
   :official? (premium-features/has-feature? :official-collections)
   :library?  (premium-features/has-feature? :library)})

(defn- verified-item-ids
  "Subset of `ids` whose most-recent moderation review for `item-type` is \"verified\"."
  [ids item-type]
  (if (empty? ids)
    #{}
    (metabot.db/verified-item-ids ids item-type)))

(defn- collection-info
  "`collection-id → {:authority_level :location :type}` for the given ids."
  [coll-ids]
  (when (seq coll-ids)
    (update-vals (metabot.db/collection-curation-info-by-id coll-ids)
                 #(select-keys % [:authority_level :location :type]))))

(defn- root-collection-type-of
  [coll-id->info coll-id]
  (let [{:keys [location type]} (get coll-id->info coll-id)]
    (collection/root-collection-type {:collection_id       coll-id
                                      :collection_location location
                                      :collection_type     type})))

(defn- moderatable-curation-signals
  "`[id signal-map]` pairs for collection-housed, moderatable models (report_card-backed and dashboards). An archived
  item, or a Card owned by a document, gets no pair: search never returns either, so neither is curated."
  [search-model t2-model item-type ids]
  (let [{:keys [verified? official? library?]} (feature-gates)
        rows     (->> (case t2-model
                        :model/Card      (metabot.db/card-curation-rows ids)
                        :model/Dashboard (metabot.db/dashboard-curation-rows ids))
                      (remove #(or (:archived %) (:document_id %))))
        coll     (collection-info (into #{} (keep :collection_id) rows))
        verified (if verified? (verified-item-ids (mapv :id rows) item-type) #{})]
    (for [{:keys [id collection_id]} rows]
      [id {:model                search-model
           :verified             (contains? verified id)
           ;; authority_level is keyword-transformed on read (collection :type is not — it stays a string,
           ;; which is what curated? and library-root-collection-types expect)
           :official_collection  (and official? (= :official (:authority_level (get coll collection_id))))
           :root_collection_type (when library? (root-collection-type-of coll collection_id))}])))

(defn- table-curation-signals
  "`[id signal-map]` pairs for tables, whose curation comes from is_published, data_layer, and data_authority. An
  inactive or hidden table, or one on a routing destination or the audit database, gets no pair: search never
  returns it, so it isn't curated.
  root_collection_type is intentionally omitted: the table search spec joins the collection only for
  published tables, and for a published table is_published already decides curation, so the root type never
  changes a table's verdict. Omitting it avoids re-deriving from a possibly-stale collection_id, and lets
  curated? coerce is_published consistently (only true/1 count)."
  [ids]
  (let [{:keys [library?]} (feature-gates)
        rows          (metabot.db/table-curation-rows ids)
        destinations  (let [db-ids (into #{} (keep :db_id) rows)]
                        (if (seq db-ids) (metabot.db/destination-database-ids db-ids) #{}))]
    (for [{:keys [id db_id active visibility_type is_published data_layer data_authority]} rows
          :when (and active
                     (nil? visibility_type)
                     (not (contains? destinations db_id))
                     (not= db_id audit-app/audit-db-id))]
      [id {:model          "table"
           :is_published   (and library? is_published)
           :data_layer     data_layer
           :data_authority data_authority}])))

(defn- curation-signals
  "`[id signal-map]` pairs for the given search-model string and ids, read from source-of-truth tables."
  [model ids]
  (cond
    (report-card-models model) (moderatable-curation-signals model :model/Card "card" ids)
    (= "dashboard" model)      (moderatable-curation-signals model :model/Dashboard "dashboard" ids)
    (= "table" model)          (table-curation-signals ids)))

(def ^:private curation-batch-size
  "How many ids one curation lookup reads at a time. Curated-only listings can judge every table in a warehouse, and
  one `IN (...)` over all of them could exceed the app DB's bind-parameter limit (65535 on Postgres)."
  10000)

(defn curated-ids
  "Of `model+ids` (`[search-model-string id]` pairs), return the subset that are curated.
  Reads each item's signals from the source tables and applies [[curation/curated?]], with no search-index
  dependency. Recognizes the Metabot recent-view models: card/dataset/metric, dashboard, table."
  [model+ids]
  (into #{}
        (for [[model ids]  (update-vals (group-by first model+ids) #(into [] (comp (map second) (distinct)) %))
              batch        (partition-all curation-batch-size ids)
              [id signals] (curation-signals model (vec batch))
              :when        (curation/curated? signals)]
          [model id])))

;;; ----- Query sources -----
;;;
;;; One rule for what a curated-only Metabot may query, shared by `construct_notebook_query`, `run_query` over a
;;; viewed saved question, and the metric reads of `read_resource`, `list_available_fields`, and `get_field_values`,
;;; so an uncurated Table can't be reached by naming it directly rather than finding it through search (BOT-1649).
;;; A curated entity covers what `read_resource` exposes through it:
;;; - a curated Table or Card covers the Tables one FK hop away (its related tables), but only as joins: the query's
;;;   own source must be curated itself, or be what a curated metric in the query is defined on, so a raw Table
;;;   can't be read in full by joining it to a curated one;
;;; - a curated metric covers the Table or Card it's defined on (its primary source) and that source's related
;;;   tables; the Tables its definition merely joins are reachable as joins only, and widen coverage no further;
;;; - a curated Table or Card covers the metrics defined on it: an uncurated metric may be used when its definition
;;;   passes this rule standing alone, which is also how a metric read is judged, so the two sides agree by
;;;   construction. The metrics a definition references are judged the same way in turn;
;;; - a measure or segment is usable when its Table, and every Table its definition reads, is curated or covered.

(declare uncurated-query-sources)

(def ^:private max-metric-nesting
  "Deepest chain of metric references the curation check follows. Deeper, or cyclic, references fail closed."
  10)

(defn- definition-query
  "`definition` (a Card's dataset query, or a measure's or segment's definition, legacy or MBQL 5) as a query against
  `mp`, or nil when it's empty or can't be built, which the callers treat as uncurated."
  [mp definition]
  (when (seq definition)
    (try
      (lib/query mp definition)
      (catch Throwable e
        (log/debug e "Curation check can't build a definition query; treating it as uncurated")
        nil))))

(defn- load-metric-definitions!
  "Load into `definitions` (the atom of metric id -> definition query, or nil for a metric whose Card is missing,
  archived, not a metric, or has no usable definition, that a [[metric-context]] shares across one judgement) the
  definitions of `metric-ids` and of the metrics they reference, transitively, `levels` levels deep. Each Card is
  loaded once per judgement: a nested call finds what the top-level walk already loaded, and the walk stops where
  [[max-metric-nesting]] would fail the chain anyway."
  [mp definitions metric-ids levels]
  (loop [todo   (set metric-ids)
         levels levels]
    (when (and (seq todo) (pos? levels))
      (let [unloaded (into [] (remove #(contains? @definitions %)) todo)
            archived (if (seq unloaded) (metabot.db/archived-card-ids unloaded) #{})
            loaded   (into (zipmap unloaded (repeat nil))
                           (map (fn [{:keys [id type dataset-query]}]
                                  ;; only a live metric Card is judged by its definition; a reference to a Card of
                                  ;; another type counts as missing, the way [[curated-metric?]] treats it
                                  [id (when (and (= type :metric) (not (contains? archived id)))
                                        (definition-query mp dataset-query))]))
                           (lib.metadata/bulk-metadata mp :metadata/card unloaded))
            _        (swap! definitions merge loaded)
            nested   (into #{}
                           (comp (keep @definitions)
                                 (mapcat #(:metric (lib/all-referenced-entity-ids [%]))))
                           todo)]
        (recur (set/difference nested (set (keys @definitions))) (dec levels))))))

(defn- metric-closure
  "Map of metric id -> definition query for `metric-ids` and every metric their definitions reference, as far as
  `definitions` holds them, so curated metrics count toward coverage at any depth. Missing metrics are left out."
  [definitions metric-ids]
  (loop [acc  {}
         todo (set metric-ids)]
    (if-let [id (first todo)]
      (let [q      (get definitions id)
            nested (when q (:metric (lib/all-referenced-entity-ids [q])))]
        (recur (cond-> acc q (assoc id q))
               (into (disj todo id) (remove #(or (contains? acc %) (= % id))) nested)))
      acc)))

(defn- metric-context
  "State for one judgement of a query's metrics: `:seen`, the metrics being judged up the current reference chain
  (the cycle guard); `:verdicts`, an atom memoizing each metric's verdict by `[id depth]` so a metric reachable
  through several references is judged once per depth; and `:definitions`, the atom [[load-metric-definitions!]]
  fills so each Card is loaded once."
  []
  {:seen #{} :verdicts (atom {}) :definitions (atom {})})

(defn- metric-ok?
  "Whether the metric `id`, whose definition query is `definition` (nil when unusable), may be used: it's curated,
  or its definition is structured and passes [[uncurated-query-sources]] on its own. A missing metric, a native
  definition, a reference cycle, or a chain deeper than [[max-metric-nesting]] fails closed. A native definition
  references no tables, so there's nothing to judge it by: like the permissions code, treat it as its own thing
  rather than as covered by default."
  [curated? id definition {:keys [seen verdicts] :as ctx}]
  ;; keyed by depth as well as id: the depth guard is a property of the path, so the same metric may pass when
  ;; referenced directly and fail at the end of a long chain
  (let [k [id (count seen)]]
    (if-some [verdict (get @verdicts k)]
      verdict
      (u/prog1 (boolean
                (or (curated? "card" id)
                    (and (some? definition)
                         (not (lib/any-native-stage? definition))
                         (not (seen id))
                         (< (count seen) max-metric-nesting)
                         (empty? (uncurated-query-sources definition (update ctx :seen conj id))))))
        (swap! verdicts assoc k <>)))))

(defn- entity-queries
  "Queries over the Tables `table-ids` and the Cards `card-ids` that `mp` can resolve."
  [mp table-ids card-ids]
  (concat (keep #(some->> (lib.metadata/table mp %) (lib/query mp)) table-ids)
          (keep #(some->> (lib.metadata/card mp %) (lib/query mp)) card-ids)))

(defn- query-coverage
  "What the curated content among the `table`s, `card`s, and `curated-metric-queries` a query reads exposes:
  `:covered`, the Tables and Cards reachable through it, and `:metric-sources`, what the curated metrics are
  defined on."
  [mp curated? table card curated-metric-queries]
  (let [metric-tables (into #{} (keep lib/primary-source-table-id) curated-metric-queries)
        metric-cards  (into #{} (keep lib/primary-source-card-id) curated-metric-queries)
        ;; a curated table or card, or a curated metric's primary source, covers itself and one FK hop out of it
        primary       (entity-queries mp
                                      (into metric-tables (filter #(curated? "table" %)) table)
                                      (into metric-cards (filter #(curated? "card" %)) card))
        ;; a curated metric's definition covers the tables it joins, as joins, and nothing beyond them
        joined        (if (seq curated-metric-queries)
                        (lib/all-referenced-entity-ids (vec curated-metric-queries))
                        {})]
    {:metric-sources {:table metric-tables :card metric-cards}
     :covered        (merge-with set/union
                                 (if (seq primary)
                                   (lib/all-referenced-entity-ids (vec primary) {:include-implicitly-joinable? true})
                                   {})
                                 joined)}))

(defn- measure-and-segment-tables
  "Map of `[kind id]` (`:measure` or `:segment`) to the set of Table ids the entity depends on: its own Table and the
  Tables its definition reads. An id `mp` can't resolve maps to nil, so the caller fails closed on it."
  [mp measure-ids segment-ids]
  (let [tables-of (fn [{:keys [table-id definition]}]
                    (cond-> #{}
                      table-id (conj table-id)
                      :always  (into (some->> (definition-query mp definition)
                                              vector
                                              lib/all-referenced-entity-ids
                                              :table))))
        found     (fn [kind metadata-type ids]
                    (let [by-id (u/index-by :id (lib.metadata/bulk-metadata mp metadata-type ids))]
                      (into {} (map (fn [id] [[kind id] (some-> (get by-id id) tables-of)])) ids)))]
    (merge (found :measure :metadata/measure measure-ids)
           (found :segment :metadata/segment segment-ids))))

(defn uncurated-query-sources
  "The `[kind id]` pairs (`\"table\"`, `\"card\"`, `:measure`, `:segment`) `query` reads that a curated-only Metabot
  may not, or empty when the query may run. Covers the source, joined, and implicitly joined Tables, source Cards,
  metrics, measures, and segments. `ctx` is the [[metric-context]] of the judgement this call is part of."
  ([query]
   (uncurated-query-sources query (metric-context)))
  ([query {:keys [seen definitions] :as ctx}]
   (let [{:keys [table card metric measure segment]} (lib/all-referenced-entity-ids [query])
         ;; `:card` also lists the metrics the query references, and a metric Card may be a source Card; judge
         ;; both as metrics, not as source Cards
         card            (set/difference card metric)
         source-metrics  (into #{}
                               (comp (filter #(= :metric (:type %))) (map :id))
                               (lib.metadata/bulk-metadata query :metadata/card card))
         metric          (into (set metric) source-metrics)
         card            (set/difference card source-metrics)
         _               (load-metric-definitions! query definitions metric (- max-metric-nesting (count seen)))
         id->definition  (metric-closure @definitions metric)
         dependents      (measure-and-segment-tables query measure segment)
         ;; `metric` as well as the loaded closure: a curated metric passes on its curation alone, including one
         ;; the walk stopped short of loading
         curated         (curated-ids (concat (for [id (into (set table) (mapcat val) dependents)] ["table" id])
                                              (for [id (concat card metric (keys id->definition))] ["card" id])))
         curated?        (fn [model id] (contains? curated [model id]))
         curated-metric-queries (keep (fn [[id q]] (when (curated? "card" id) q)) id->definition)
         {:keys [covered metric-sources]} (query-coverage query curated? table card curated-metric-queries)
         allowed?        (fn [model id] (or (curated? model id) (contains? (get covered (keyword model)) id)))
         source-allowed? (fn [model id] (or (curated? model id) (contains? (get metric-sources (keyword model)) id)))
         source-table    (lib/primary-source-table-id query)
         source-card     (lib/primary-source-card-id query)]
     (into []
           cat
           [(for [id table
                  :when (not (if (= id source-table) (source-allowed? "table" id) (allowed? "table" id)))]
              ["table" id])
            (for [id card
                  :when (not (if (= id source-card) (source-allowed? "card" id) (allowed? "card" id)))]
              ["card" id])
            (for [id metric :when (not (metric-ok? curated? id (id->definition id) ctx))]
              ["card" id])
            (for [[subject tables] dependents
                  :when (or (nil? tables) (not (every? #(allowed? "table" %) tables)))]
              subject)]))))

(defn covered-table-ids
  "The Tables one FK hop away from the Tables `table-ids` and the result columns of the Cards `card-ids`, plus the
  Tables themselves: what a curated-only Metabot may join when those entities are curated."
  [mp table-ids card-ids]
  (let [queries (entity-queries mp table-ids card-ids)]
    (if (seq queries)
      (:table (lib/all-referenced-entity-ids (vec queries) {:include-implicitly-joinable? true}))
      #{})))

(defn curated-metric?
  "Whether a curated-only Metabot may read the Card with `metric-id` where a metric is expected: the same judgement
  [[uncurated-query-sources]] makes for a metric a query uses (see [[metric-ok?]]). A curated Card of any type
  passes on its own curation; only a live metric Card is judged by its definition, so an uncurated question or
  model named here is denied like anywhere else, and a missing or archived Card is."
  [metric-id]
  (let [curated?   (fn [model id] (contains? (curated-ids [[model id]]) [model id]))
        definition (when-let [{:keys [database_id dataset_query archived]} (metabot.db/card-of-type metric-id :metric)]
                     (when-not archived
                       (definition-query (lib-be/application-database-metadata-provider database_id) dataset_query)))]
    (boolean (metric-ok? curated? metric-id definition (metric-context)))))

(defn usable-metric-ids
  "The subset of the metric Card ids `ids` a curated-only Metabot may use: curated ones, and uncurated ones whose
  definition passes the rule (see [[curated-metric?]])."
  [ids]
  (let [curated (curated-ids (map #(vector "card" %) ids))]
    (into #{}
          (filter (fn [id] (or (contains? curated ["card" id]) (curated-metric? id))))
          ids)))

(defn subject-curated?
  "Whether `subject`, a `[model id]` pair, is curated: `\"table\"`, `\"card\"`, and `\"dashboard\"` by their own
  signals; `\"metric\"` as [[curated-metric?]] judges a Card named where a metric is expected; anything else
  (`\"transform\"`) never."
  [[model id :as subject]]
  (if (= model "metric")
    (curated-metric? id)
    (contains? (curated-ids [subject]) subject)))

(defn check-curated-subject!
  "Reject `subject` — a `[model id]` pair, see [[subject-curated?]] — unless it's curated, naming it by `label` (a
  URI or a short description such as \"table 12\") rather than by the entity's own name. Callers decide whether
  the session is curated-only. A nil `subject` passes."
  [label subject]
  (when (and subject (not (subject-curated? subject)))
    (recoverable.common/not-curated! {:label label})))
