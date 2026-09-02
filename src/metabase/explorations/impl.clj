(ns metabase.explorations.impl
  "Implementation helpers for the Explorations feature, shared between the
   `/api/exploration/dimensions` endpoint and the metabot tools layer.

   The headline function is [[exploration-data]]: given an optional set of metric ids
   and an optional search string, it returns the same shape the FE consumes from
   `GET /api/exploration/dimensions`, so callers can hand it straight to the
   exploration-data modal without an extra round trip."
  (:require
   [clojure.string :as str]
   [metabase.collections.models.collection :as collection]
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.models.exploration-block :as block]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.metrics.core :as metrics]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def min-interestingness
  "Minimum `dimension_interestingness` score required for a dimension to be surfaced
   in the Explorations UI. Dimensions scoring below this are dropped; dimensions with
   a nil score (didn't score) are kept."
  0.1)

;;; Columns we actually need from `Card`. We deliberately avoid pulling the full row
;;; (which includes large blobs like `:result_metadata`, `:visualization_settings`,
;;; `:parameter_mappings`, etc.) so the response stays small and JSON encoding is fast.
(def ^:private metric-card-cols
  [:id :name :description :collection_id :database_id :table_id :type :entity_id
   :card_schema :dataset_query :dimensions :dimension_mappings])

(defn- library-metrics-collection-ids
  "Set of collection ids (the library-metrics root + descendants) whose metric Cards should be sorted
   to the top of the /dimensions response."
  []
  (when-let [root (explorations.db/library-metrics-root-collection collection/library-metrics-collection-type)]
    (conj (or (collection/descendant-ids root) #{}) (:id root))))

(defn- metric-query
  "Build the metric's single-stage lib query once, reused for resolving dimension targets and
   computing the result column name. Returns nil when the metric has no `:dataset_query` or the
   query can't be built (callers treat nil conservatively, matching the prior per-dimension
   try/catch behavior)."
  [metric]
  (when-let [dataset-query (:dataset_query metric)]
    (try
      (lib/query (lib-be/application-database-metadata-provider (:database_id metric)) dataset-query)
      (catch Exception e
        (log/debugf e "Could not build query for metric %s" (:id metric))
        nil))))

(defn- result-column-name
  "Name of the first aggregation column in `query` (the metric's result column), or nil."
  [query]
  (when query
    (try
      (->> (lib/returned-columns query)
           (filter lib/aggregation-sourced?)
           first
           :name)
      (catch Exception _ nil))))

(defn- metric-matches-search?
  "Case-insensitive match of `q-lower` against the metric's name or any of its dimensions'
   curated [[block/dimension-label]]s — the same text the picker surfaces."
  [metric q-lower]
  (or (str/includes? (u/lower-case-en (or (:name metric) "")) q-lower)
      (some (fn [d]
              (str/includes? (u/lower-case-en (or (block/dimension-label d) "")) q-lower))
            (:dimensions metric))))

(defn- group-dimensions
  "Collapse dimensions across the supplied metrics into a list of dimension groups. Dimensions that
   share at least one source entry are unioned into the same group (matching the semantics of
   `lib-metric/same-source?`). Each group exposes the curated [[block/dimension-label]], a
   representative interestingness, and the list of underlying dimensions that callers must echo
   back to `POST /api/exploration` when the user starts an exploration."
  [metrics]
  (let [;; Flatten + filter once. Keep dims whose interestingness is nil (didn't score) or above
        ;; the threshold
        all-dims (->> (mapcat :dimensions metrics)
                      (filter (fn [d]
                                (let [score (:dimension-interestingness d)]
                                  (or (nil? score)
                                      (>= score min-interestingness))))))
        groups   (lib-metric/group-by-source all-dims)]
    (->> groups
         (mapv (fn [dims]
                 (let [head   (first dims)
                       scores (keep :dimension-interestingness dims)]
                   {:name                      (or (block/dimension-label head) "")
                    :dimension_interestingness (when (seq scores) (apply max scores))
                    :dimensions                (vec dims)})))
         (sort-by (fn [g]
                    (if-let [score (:dimension_interestingness g)]
                      [0 (- score)]
                      [1 0])))
         vec)))

(defn- accessible-metric-ids
  "Card ids the current user can read, ordered with `library-ids` collections (see
   [[library-metrics-collection-ids]], computed once by the caller) first then alphabetically by
   name. Optionally restricted to `metric-ids` (when non-nil), preserving access checks but
   filtering to that subset."
  [metric-ids library-ids]
  (let [base-where  (queries/visible-metric-cards-where-clause)
        where       (if (seq metric-ids)
                      [:and base-where [:in :id (vec metric-ids)]]
                      base-where)]
    (->> (explorations.db/metric-card-ids-where where (or (seq library-ids) [-1]))
         (mapv :id))))

(defn- load-metric-cards
  "Load the metric Card rows for `card-ids` in a single batched SELECT, returning them
   in the same order as `card-ids`. Only the columns we actually need downstream are
   projected — the full Card row is many KB per metric (result_metadata,
   visualization_settings, dataset_query, etc.) and dominates response size."
  [card-ids]
  (when (seq card-ids)
    (let [rows   (explorations.db/metric-cards-with-columns (into [:model/Card] metric-card-cols) card-ids)
          by-id  (u/index-by :id rows)]
      (into [] (keep by-id) card-ids))))

(defn- sync-missing-dimensions!
  "Self-heal metrics whose dimensions were never successfully synced (`:dimensions` NULL/empty) —
   e.g. metrics created on a model before the model had `result_metadata`, or SQL-model metrics
   that predate the source-card dimension-sync fix (UXW-4475). Syncs each such metric and returns
   `cards` with the healed rows reloaded. Metrics whose sync computes nothing (or throws) are
   returned unchanged; they will be retried on a later call, which is cheap (app-DB reads only,
   no write when nothing changed)."
  [cards]
  (let [broken-ids (into []
                         (comp (filter #(and (:dataset_query %) (empty? (:dimensions %))))
                               (map :id))
                         cards)]
    (if (empty? broken-ids)
      cards
      (do
        (doseq [id broken-ids]
          (try
            (metrics/sync-dimensions! :metadata/metric id)
            (catch Throwable e
              (log/warnf e "Failed to sync dimensions for metric card %d" id))))
        (let [healed (u/index-by :id (explorations.db/cards-with-columns (into [:model/Card] metric-card-cols) broken-ids))]
          (mapv #(or (get healed (:id %)) %) cards))))))

(defn- simple-table-query?
  "True if `query` is a single-stage query over a base table (the metric's `:table_id`) with no
   explicit joins or expressions. Such a query's breakoutable columns depend only on the source
   table — not on the metric's aggregation or filters — so metrics that share the table share the
   same breakoutable columns."
  [metric query]
  (boolean
   (and query
        (:table_id metric)
        (= 1 (lib/stage-count query))
        (empty? (lib/joins query 0))
        (empty? (lib/expressions query 0)))))

(defn- make-breakoutable-resolver
  "Returns a stateful `(metric query) -> breakoutable-columns` that memoizes within one
   [[exploration-data]] call. `lib/breakoutable-columns` is the dominant per-metric cost and
   depends only on the source table/joins/expressions, so metrics that are simple queries over
   the same table (see [[simple-table-query?]]) reuse a single computation. Non-simple queries
   (explicit joins, expressions, nested stages, card sources) are computed per metric. Scoped to
   one call so the cache can never go stale."
  []
  (let [cache (atom {})]
    (fn [metric query]
      (when query
        (if (simple-table-query? metric query)
          (let [k [(:database_id metric) (:table_id metric)]]
            (or (get @cache k)
                (let [cols (lib/breakoutable-columns query)]
                  (swap! cache assoc k cols)
                  cols)))
          (lib/breakoutable-columns query))))))

(defn target-resolvable?
  "True if `target` (an MBQL field ref from a metric's `:dimension_mappings`) resolves to one of
   `breakoutable-cols` in the metric's single-stage `query`. Used to silently drop dimensions
   that the Explorations query-generation path can't actually use.

   `query` and `breakoutable-cols` are built once per metric by the caller and reused across all
   that metric's dimensions (possibly shared across same-table metrics, see
   [[make-breakoutable-resolver]]). Returns `false` defensively on any normalization/resolution
   exception so a bad dim never blocks the rest of the response."
  [query breakoutable-cols target]
  (try
    (some? (lib/find-matching-column
            query -1 (metrics/normalize-target-ref target) breakoutable-cols))
    (catch Exception e
      (log/debugf e "Dimension target %s not resolvable, dropping" (pr-str target))
      false)))

(defn- filter-resolvable-dimensions
  "Drop any `:dimensions` and corresponding `:dimension_mappings` on `metric` whose target
   field ref doesn't resolve against the metric's prebuilt `query`. A dimension with no mapping
   at all is kept (no target = no breakout = nothing to resolve).

   `query` is built once per metric (see [[metric-query]]) and `breakoutable` is its breakoutable
   columns (possibly shared across same-table metrics, see [[make-breakoutable-resolver]]). When
   the metric had a `:dataset_query` but the query couldn't be built (`query` is nil), mapped
   dimensions drop and unmapped ones are kept — matching the prior per-dimension try/catch
   semantics."
  [metric query breakoutable]
  (if-not (:dataset_query metric)
    metric
    (let [mappings-by-id (u/index-by :dimension-id (:dimension_mappings metric))
          keep?          (fn [dim]
                           (if-let [target (get-in mappings-by-id [(:id dim) :target])]
                             (and (some? query) (target-resolvable? query breakoutable target))
                             true))
          kept-dims      (filterv keep? (:dimensions metric))
          kept-ids       (into #{} (map :id) kept-dims)]
      (-> metric
          (assoc :dimensions kept-dims)
          (update :dimension_mappings
                  (fn [ms] (filterv #(contains? kept-ids (:dimension-id %)) ms)))))))

(defn- slim-metric
  "Drop a hydrated metric's inline `:dimensions`, exposing just their ids as `:dimension_ids`
   (the shape the FE picker consumes)."
  [m]
  (-> m
      (assoc :dimension_ids (mapv :id (:dimensions m)))
      (dissoc :dimensions)))

(defn- matching-metrics
  "`metrics` restricted to those matching search `q`; all of them
   when `q` is blank."
  [q metrics]
  (if (str/blank? q)
    metrics
    (let [q-lower (u/lower-case-en q)]
      (filterv #(metric-matches-search? % q-lower) metrics))))

(defn- catalog-metrics
  "Permission-filtered metric Cards with their synced `:dimensions` inlined and each dimension
   annotated with its Field's interestingness, restricted to `:metric-ids` (or all visible when
   nil). Dimension targets are not resolved and `:result_column_name` is not computed."
  [{:keys [metric-ids]}]
  (let [library-ids (or (library-metrics-collection-ids) #{})
        card-ids    (accessible-metric-ids metric-ids library-ids)
        cards       (sync-missing-dimensions! (load-metric-cards card-ids))
        ;; Filter dimensions by user permissions for all metrics at once (one set of queries
        ;; for the whole batch, rather than per metric).
        permitted   (metrics/filter-dimensions-for-user-batch cards)]
    (->> permitted
         (mapv #(assoc % :in_library (contains? library-ids (:collection_id %))))
         (metrics/annotate-dimensions-with-field-data [:dimension_interestingness]))))

(defn- resolve-metric-queries
  "Drop each metric's dimensions whose target doesn't resolve against its own query and compute
   `:result_column_name`. This is the expensive half of [[hydrated-metrics]] — every metric pays
   a query build, and `lib/breakoutable-columns` on top of that."
  [metrics]
  (let [resolve-breakoutable (make-breakoutable-resolver)]
    (mapv (fn [m]
            ;; Build the metric's query once and reuse it for resolving dimension targets and
            ;; computing the result column name. Breakoutable columns (the dominant cost) are
            ;; shared across metrics that query the same table.
            (let [query        (metric-query m)
                  breakoutable (resolve-breakoutable m query)]
              (-> m
                  (filter-resolvable-dimensions query breakoutable)
                  (assoc :result_column_name (result-column-name query))
                  ;; dataset_query was only needed to build `query`.
                  (dissoc :dataset_query))))
          metrics)))

(defn- hydrated-metrics
  "Permission-filtered, interestingness-annotated metric Cards with their candidate dimensions
   inlined as `:dimensions`, restricted to `:metric-ids` (or all visible when nil) and optionally
   filtered by search `:q`. Shared by [[exploration-data]], [[research-candidates]], and
   [[research-groups]]."
  [{:keys [q] :as opts}]
  (lib-be/with-metadata-provider-cache
    (->> (catalog-metrics opts)
         resolve-metric-queries
         (matching-metrics q))))

(defn- index-metrics
  "[[hydrated-metrics]] minus [[resolve-metric-queries]], for callers that need only a metric's
   identity and its dimension names. Skipping target resolution means a dimension the metric's
   query can't actually break out on is still counted here — over-inclusive by design, since the
   caller ([[research-metric-index]]) surfaces no dimension the user could act on."
  [{:keys [q] :as opts}]
  (lib-be/with-metadata-provider-cache
    (matching-metrics q (catalog-metrics opts))))

(defn- candidate-dimension?
  "Whether a dimension is surfaced as a research candidate: it scored at or above
   [[min-interestingness]], or it didn't score (nil). Mirrors the filter [[group-dimensions]]
   applies, so a metric's candidate dimensions match the dimension groups exactly."
  [d]
  (let [score (:dimension-interestingness d)]
    (or (nil? score) (>= score min-interestingness))))

(defn- with-candidate-dimensions
  "Restrict a hydrated metric's inline `:dimensions` to the research candidates (see
   [[candidate-dimension?]]), so callers never surface or accept a sub-threshold dimension that the
   dimension groups (and thus the FE) would drop."
  [m]
  (update m :dimensions #(filterv candidate-dimension? %)))

(defn exploration-data
  "Returns the data shape used by `GET /api/exploration/dimensions` and any other caller that
   needs the modal-ready hydrated metrics + grouped dimensions.

   - `:metric-ids` (optional) — when non-nil, restricts the result to those metric Card
     ids the user can read. When nil, returns all visible metric Cards.
   - `:q` (optional) — case-insensitive search across metric name and dimension display-name.

   Metrics carry only their candidate dimensions (see [[with-candidate-dimensions]]) so each
   metric's `:dimension_ids` reference dimensions that actually appear in `:dimension_groups` —
   no dangling ids for sub-threshold dimensions the groups drop.

   The returned shape is `{:metrics [...] :dimension_groups [...]}` exactly matching the
   `::DimensionsResponse` schema in `metabase.explorations.api`."
  [opts]
  (let [filtered (mapv with-candidate-dimensions (hydrated-metrics opts))]
    {:metrics          (mapv slim-metric filtered)
     :dimension_groups (group-dimensions filtered)}))

(defn exploration-data->api
  "Convert an [[exploration-data]]/[[research-groups]]-shaped payload's dimension and mapping
   objects from the internal kebab-case shape to the snake_case API shape (see
   [[metabase.metrics.dimension/->api-dimension]]). Applied by FE-facing edges — the
   `GET /api/exploration/dimensions` endpoint and the `add_research_groups` metabot tool
   (whose `:output` the exploration chat FE parses). Envelope keys are snake_case already;
   LLM-only payloads ([[research-candidates]]) are not converted."
  [payload]
  (-> payload
      (update :metrics
              (fn [metrics]
                (mapv (fn [metric]
                        (cond-> metric
                          (:dimension_mappings metric)
                          (update :dimension_mappings metrics/->api-dimension-mappings)))
                      metrics)))
      (update :dimension_groups
              (fn [groups]
                (mapv #(update % :dimensions metrics/->api-dimensions) groups)))))

(defn- dimension-id->metric-ids
  "Map of dimension id -> set of metric ids exposing that dimension, across `metrics` (each
   carrying inline `:dimensions`)."
  [metrics]
  (reduce (fn [acc m]
            (reduce (fn [a d] (update a (:id d) (fnil conj #{}) (:id m)))
                    acc (:dimensions m)))
          {} metrics))

(def ^:private llm-metric-cols
  "Metric fields surfaced to Metabot in the research catalog."
  [:id :name :description :result_column_name])

(def research-candidates-max-metrics
  "Maximum metrics a single `get_research_candidates` response details. Explicit `:metric-ids`
   requests are capped to this at the tool layer; `:q` requests matching more are truncated (with
   a marker) so a broad search term can't recreate the unbounded catalog dump this bound exists
   to prevent."
  20)

(def research-metric-index-max-metrics
  "Maximum rows a single `list_research_metrics` response lists. Index rows are slim, but an
   unfiltered index on an instance with thousands of metrics is still a prompt-straining blob
   (measured ~130 bytes/row); above this the index is truncated and stamped with a marker so the
   model knows to narrow with `q`."
  500)

(def ^:private catalog-description-max-length
  "Character budget for a metric description in either research tool's payload — enough for scent,
   short enough that a handful of essay-length descriptions can't dominate a response. A model
   that needs the whole thing can `read_resource` the metric."
  150)

(defn- truncate-description
  [description]
  (when-let [d (some-> description str/trim not-empty)]
    (if (> (count d) catalog-description-max-length)
      (str (subs d 0 catalog-description-max-length) "…")
      d)))

(defn- metric-interestingness
  "Ranking score for a metric: the max interestingness across its candidate dimensions, or nil
   when none scored. Callers pass metrics already restricted to their candidate dimensions (see
   [[with-candidate-dimensions]]), so a metric whose every dimension scored below
   [[min-interestingness]] scores nil here rather than its best sub-threshold dimension."
  [m]
  (some->> (keep :dimension-interestingness (:dimensions m)) seq (apply max)))

(defn- rank-metrics
  "Order `metrics` library-first then by interestingness (unscored last) — the order both
   research-tool caps clip in, so the best-curated content survives truncation."
  [metrics]
  (vec (sort-by (fn [m]
                  [(if (:in_library m) 0 1)
                   (- (or (metric-interestingness m) -1))])
                metrics)))

(defn research-metric-index
  "Slim research catalog index for the `list_research_metrics` Metabot tool:
   `{:metrics [{:id :name :description :in_library} ...]}` — one row per metric the user can
   read, truncated `:description`, no dimensions. The model shortlists metric ids here, then
   fetches their dimension detail via [[research-candidates]]. `:q` filters like
   [[exploration-data]]'s — a case-insensitive substring match on metric names and dimension
   display names.

   Rows are always ordered by [[rank-metrics]], so a metric doesn't move just because the
   instance grew past the cap. More than [[research-metric-index-max-metrics]] matches are
   truncated and stamped `{:truncated true :shown <n> :matched <m>}` so the model knows to narrow
   with `:q`. A metric with no candidate dimensions still gets a row — it can form a group on
   its own — but ranks below every metric that has one."
  [opts]
  (let [ranked (rank-metrics (mapv with-candidate-dimensions (index-metrics opts)))
        capped (vec (take research-metric-index-max-metrics ranked))
        rows   (mapv (fn [m]
                       {:id          (:id m)
                        :name        (:name m)
                        :description (truncate-description (:description m))
                        :in_library  (:in_library m)})
                     capped)]
    (cond-> {:metrics rows}
      (> (count ranked) (count capped))
      (assoc :truncated true
             :shown (count capped)
             :matched (count ranked)))))

(defn- llm-dimension-groups
  "`groups` (from [[group-dimensions]] over `metrics`) in the `get_research_candidates` shape: the
   descriptive fields stated once, plus the ids of the metrics the group can slice. The per-metric
   dimension ids live on the metrics themselves (see [[llm-metric-dimensions]]).

   `:effective_type`/`:semantic_type` appear only when every dimension in the group agrees on
   them."
  [metrics groups]
  (let [dim->metrics (dimension-id->metric-ids metrics)]
    (mapv (fn [g]
            (let [dims  (:dimensions g)
                  types (when (= 1 (count (distinct (map (juxt :effective-type :semantic-type) dims))))
                          (first dims))]
              (cond-> {:name            (:name g)
                       :interestingness (:dimension_interestingness g)
                       :metric_ids      (vec (sort (into #{} (mapcat #(dim->metrics (:id %))) dims)))}
                types (assoc :effective_type (:effective-type types)
                             :semantic_type  (:semantic-type types)))))
          groups)))

(defn- llm-metric-dimensions
  "One metric's candidate dimensions in the `get_research_candidates` shape: the `:id` to echo to
   `add_research_groups`, tagged with the `:group` whose descriptive fields describe it. `:name`
   appears only when this metric calls the dimension something other than its group name — renames
   are common, but repeating the group name on every member is most of the payload."
  [m dim->group-name]
  (mapv (fn [d]
          (let [group-name (dim->group-name (:id d))
                own-name   (or (block/dimension-label d) "")]
            (cond-> {:id (:id d) :group group-name}
              (not= own-name group-name) (assoc :name own-name))))
        (:dimensions m)))

(defn research-candidates
  "Metabot-facing research catalog detail for the `get_research_candidates` tool: the requested
   metrics, each carrying the dimension ids it can be sliced by, plus the dimension groups those
   ids belong to. Descriptive dimension fields are stated once per group rather than once per
   metric. The FE does not consume this.

   Accepts the same `:metric-ids`/`:q` options as [[exploration-data]]; callers pass at least one
   (the tool layer enforces it). An explicit `:metric-ids` request returns exactly those metrics
   (the tool caps the id count), stamping any that didn't come back — unknown or unreadable — as
   `:missing_metric_ids`. A `:q` request matching more than [[research-candidates-max-metrics]]
   metrics is truncated in [[rank-metrics]] order and stamped
   `{:truncated true :shown <n> :matched <m>}` so the model knows to narrow the search."
  [{:keys [metric-ids] :as opts}]
  (let [filtered  (mapv with-candidate-dimensions (hydrated-metrics opts))
        capped    (if (seq metric-ids)
                    filtered
                    (vec (take research-candidates-max-metrics (rank-metrics filtered))))
        groups    (group-dimensions capped)
        dim-group (into {} (for [g groups, d (:dimensions g)] [(:id d) (:name g)]))
        missing   (vec (distinct (remove (set (map :id capped)) metric-ids)))]
    (cond-> {:metrics          (mapv (fn [m]
                                       (-> (select-keys m llm-metric-cols)
                                           (update :description truncate-description)
                                           (assoc :dimensions (llm-metric-dimensions m dim-group))))
                                     capped)
             :dimension_groups (llm-dimension-groups capped groups)}
      (> (count filtered) (count capped))
      (assoc :truncated true
             :shown (count capped)
             :matched (count filtered))

      (seq missing)
      (assoc :missing_metric_ids missing))))

(defn research-groups
  "Validate Metabot's chosen research groups and return the FE picker payload for them.

   `:groups` is a sequence of `{:metric_id <int> :dimension_ids [<str> ...]}` maps
   (`:dimension_ids` optional).

   Hard-errors (throws) on any unknown/inaccessible metric id or a dimension id that isn't a
   candidate of its metric — one bad id fails the whole batch.

   On success returns `{:metrics [...] :dimension_groups [...] :groups [...]}`, where
   `:metrics`/`:dimension_groups` are the [[exploration-data]] hydration restricted to the
   referenced metrics, and `:groups` echoes the validated specs for the FE to turn into picker
   blocks."
  [{:keys [groups]}]
  (let [all          (mapv with-candidate-dimensions (hydrated-metrics {}))
        metric-by-id (u/index-by :id all)]
    (doseq [g groups]
      (let [metric-id (:metric_id g)
            metric    (get metric-by-id metric-id)]
        (when-not metric
          (throw (ex-info (format "Unknown or inaccessible metric id %s" metric-id)
                          {:metric_id metric-id})))
        (when (and (:replace_default_dimensions g) (empty? (:dimension_ids g)))
          (throw (ex-info "replace_default_dimensions requires at least one dimension_id"
                          {:metric_id metric-id})))
        (let [valid (set (map :id (:dimensions metric)))]
          (doseq [d (:dimension_ids g)]
            (when-not (contains? valid d)
              (throw (ex-info (format "Dimension %s is not a candidate of metric %s" d metric-id)
                              {:metric_id metric-id :dimension_id d})))))))
    (let [relevant         (into #{} (map :metric_id) groups)
          relevant-metrics (filterv #(contains? relevant (:id %)) all)]
      {:metrics          (mapv slim-metric relevant-metrics)
       :dimension_groups (group-dimensions relevant-metrics)
       :groups           (vec groups)})))
