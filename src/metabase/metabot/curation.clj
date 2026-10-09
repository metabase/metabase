(ns metabase.metabot.curation
  "Source-of-truth curation checks for Metabot: recent-view context, and the tools that must stay within curated
  content when a Metabot has `use_verified_content` on (see [[curated-content-only?]]).
  Reads each item's curation signals straight from the source tables and applies the canonical
  [[metabase.collections.curation/curated?]] predicate, so it has no dependency on the search index being
  present, fresh, or complete, and can't drift from the rule.
  Lives in metabot rather than collections.curation because it reads cards/dashboards/tables/reviews, which
  are higher-level models a foundational module shouldn't reference; a consistency test pins it to the
  index's precomputed `curated` column."
  (:require
   [clojure.set :as set]
   [metabase.collections.curation :as curation]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.db :as metabot.db]
   [metabase.util :as u]))

(def ^:private report-card-models
  "Search-model strings backed by `report_card`, moderated as \"card\"."
  #{"card" "dataset" "metric"})

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
  "`[id signal-map]` pairs for collection-housed, moderatable models (report_card-backed and dashboards)."
  [search-model t2-model item-type ids]
  (let [rows     (case t2-model
                   :model/Card      (metabot.db/card-collection-ids ids)
                   :model/Dashboard (metabot.db/dashboard-collection-ids ids))
        coll     (collection-info (into #{} (keep :collection_id) rows))
        verified (verified-item-ids ids item-type)]
    (for [{:keys [id collection_id]} rows]
      [id {:model                search-model
           :verified             (contains? verified id)
           ;; authority_level is keyword-transformed on read (collection :type is not — it stays a string,
           ;; which is what curated? and library-root-collection-types expect)
           :official_collection  (= :official (:authority_level (get coll collection_id)))
           :root_collection_type (root-collection-type-of coll collection_id)}])))

(defn- table-curation-signals
  "`[id signal-map]` pairs for tables, whose curation comes from is_published, data_layer, and data_authority.
  root_collection_type is intentionally omitted: the table search spec joins the collection only for
  published tables, and for a published table is_published already decides curation, so the root type never
  changes a table's verdict. Omitting it avoids re-deriving from a possibly-stale collection_id, and lets
  curated? coerce is_published consistently (only true/1 count)."
  [ids]
  (for [{:keys [id is_published data_layer data_authority]}
        (metabot.db/table-curation-rows ids)]
    [id {:model          "table"
         :is_published   is_published
         :data_layer     data_layer
         :data_authority data_authority}]))

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

(def ^:private curation-exempt-profiles
  "Profiles whose tools aren't restricted by `use_verified_content`. The nlq profile discovers data through the curated
  library tool, which carries its own scoping; `nlq-fallback` serves the same profile."
  #{"nlq" "nlq-fallback"})

(defn curated-content-only?
  "Whether a Metabot tool running for `metabot-id` under `profile-id` may only reach curated content, i.e. the Metabot
  has `use_verified_content` on and the profile isn't exempt."
  [metabot-id profile-id]
  (boolean
   (and (not (curation-exempt-profiles (some-> profile-id name)))
        (:use_verified_content (metabot.config/metabot-by-id metabot-id)))))

;;; ----- Query sources -----
;;;
;;; One rule for what a curated-only Metabot may query, shared by `construct_notebook_query` and by the metric reads
;;; of `read_resource`, `list_available_fields`, and `get_field_values`, so an uncurated Table can't be reached by
;;; naming it directly rather than finding it through search (BOT-1649). A curated entity covers what `read_resource`
;;; exposes through it:
;;; - a curated Table or Card covers the Tables one FK hop away (its related tables), but only as joins: the query's
;;;   own source must be curated itself, or be what a curated metric in the query is defined on, so a raw Table
;;;   can't be read in full by joining it to a curated one;
;;; - a curated metric covers the Table or Card it's defined on (its primary source, not the Tables it joins), and
;;;   their related tables;
;;; - a curated Table or Card covers the metrics defined on it: an uncurated metric may be used when its definition
;;;   passes this rule standing alone, which is also how a metric read is judged, so the two sides agree by
;;;   construction. The metrics a definition references are judged the same way in turn.

(declare uncurated-query-sources)

(def ^:private max-metric-nesting
  "Deepest chain of metric references the curation check follows. Deeper, or cyclic, references fail closed."
  10)

(defn- load-metric-definitions!
  "Load into `definitions` (the atom of metric id -> definition query, or nil for a metric whose Card no longer
  exists, that a [[metric-context]] shares across one judgement) the definitions of `metric-ids` and of the metrics
  they reference, transitively, `levels` levels deep. Each Card is loaded once per judgement: a nested call finds
  what the top-level walk already loaded, and the walk stops where [[max-metric-nesting]] would fail the chain
  anyway, so a chain costs one load per level rather than one per level per level."
  [mp definitions metric-ids levels]
  (loop [todo   (set metric-ids)
         levels levels]
    (when (and (seq todo) (pos? levels))
      (let [unloaded (remove #(contains? @definitions %) todo)
            loaded   (into {}
                           (map (fn [id]
                                  ;; only a metric Card is judged by its definition; a reference to a Card of
                                  ;; another type counts as missing, the way [[curated-metric?]] treats it
                                  (let [{:keys [type dataset-query]} (lib.metadata/card mp id)]
                                    [id (when (= type :metric) (lib/query mp dataset-query))])))
                           unloaded)
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
  "Whether the metric `id`, whose definition query is `definition` (nil when its Card no longer exists), may be used:
  it's curated, or its definition is structured and passes [[uncurated-query-sources]] on its own. A missing metric,
  a native definition, a reference cycle, or a chain deeper than [[max-metric-nesting]] fails closed. A native
  definition references no tables, so there's nothing to judge it by: like the permissions code, treat it as its
  own thing rather than as covered by default."
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

(defn- query-coverage
  "What the curated content among the `table`s, `card`s, and `curated-metric-queries` a query reads exposes:
  `:covered`, the Tables and Cards reachable through it (itself and its related tables), and `:metric-sources`, what
  the curated metrics are defined on."
  [mp curated? table card curated-metric-queries]
  {:metric-sources {:table (into #{} (keep lib/primary-source-table-id) curated-metric-queries)
                    :card  (into #{} (keep lib/primary-source-card-id) curated-metric-queries)}
   :covered        (lib/all-referenced-entity-ids
                    (concat (for [id table :when (curated? "table" id)] (lib/query mp (lib.metadata/table mp id)))
                            (for [id card  :when (curated? "card" id)] (lib/query mp (lib.metadata/card mp id)))
                            curated-metric-queries)
                    {:include-implicitly-joinable? true})})

(defn uncurated-query-sources
  "The `[\"table\" id]` / `[\"card\" id]` pairs `query` reads that a curated-only Metabot may not, or empty when the
  query may run. Covers the source, joined, and implicitly joined Tables, source Cards, and metrics. `ctx` is the
  [[metric-context]] of the judgement this call is part of."
  ([query]
   (uncurated-query-sources query (metric-context)))
  ([query {:keys [seen definitions] :as ctx}]
   (let [{:keys [table card metric]} (lib/all-referenced-entity-ids [query])
         ;; `:card` also lists the metrics the query references, and a metric Card may be a source Card; judge
         ;; both as metrics, not as source Cards
         card            (set/difference card metric)
         source-metrics  (into #{} (filter #(= :metric (:type (lib.metadata/card query %)))) card)
         metric          (into (set metric) source-metrics)
         card            (set/difference card source-metrics)
         _               (load-metric-definitions! query definitions metric (- max-metric-nesting (count seen)))
         id->definition  (metric-closure @definitions metric)
         ;; `metric` as well as the loaded closure: a curated metric passes on its curation alone, including one
         ;; the walk stopped short of loading
         curated         (curated-ids (into #{}
                                            (concat (for [id table] ["table" id])
                                                    (for [id (concat card metric (keys id->definition))]
                                                      ["card" id]))))
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
              ["card" id])]))))

(defn curated-metric?
  "Whether a curated-only Metabot may read the Card with `metric-id` where a metric is expected: the same judgement
  [[uncurated-query-sources]] makes for a metric a query uses (see [[metric-ok?]]). A curated Card of any type
  passes on its own curation; only a metric Card is judged by its definition, so an uncurated question or model
  named here is denied like anywhere else, and a missing Card is."
  [metric-id]
  (let [curated?   (fn [model id] (seq (curated-ids [[model id]])))
        definition (when-let [{:keys [database_id dataset_query]} (metabot.db/card-of-type metric-id :metric)]
                     (lib/query (lib-be/application-database-metadata-provider database_id) dataset_query))]
    (boolean (metric-ok? curated? metric-id definition (metric-context)))))
