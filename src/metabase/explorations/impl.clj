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
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.metrics.core :as metrics]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
  (when-let [root (t2/select-one [:model/Collection :id :location]
                                 :type collection/library-metrics-collection-type)]
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

(defn- dimension-display-name
  "Combination name shown in the UI for a dimension: '<group display name> - <dimension display name>'
   when the dimension has a group, otherwise just the dimension's display name."
  [d]
  (let [dn       (or (:display_name d) (:name d) "")
        group-dn (some-> d :group :display_name)]
    (if (str/blank? group-dn)
      dn
      (str group-dn " - " dn))))

(defn- metric-matches-search?
  "Case-insensitive match of `q-lower` against the metric's name or any of its dimensions'
   *displayed* names — the `<group> - <dimension>` combination the picker shows (see
   [[dimension-display-name]]), so searching a group name, a dimension name, or the combined
   string all match what the user sees."
  [metric q-lower]
  (or (str/includes? (u/lower-case-en (or (:name metric) "")) q-lower)
      (some (fn [d]
              (str/includes? (u/lower-case-en (dimension-display-name d)) q-lower))
            (:dimensions metric))))

(defn- group-dimensions
  "Collapse dimensions across the supplied metrics into a list of dimension groups. Dimensions that
   share at least one source entry are unioned into the same group (matching the semantics of
   `lib-metric/same-source?`). Each group exposes the user-facing combination name, a representative
   interestingness, and the list of underlying dimensions that callers must echo back to
   `POST /api/exploration` when the user starts an exploration."
  [metrics]
  (let [;; Flatten + filter once. Keep dims whose interestingness is nil (didn't score) or above
        ;; the threshold
        all-dims (->> (mapcat :dimensions metrics)
                      (filter (fn [d]
                                (let [score (:dimension_interestingness d)]
                                  (or (nil? score)
                                      (>= score min-interestingness))))))
        groups   (lib-metric/group-by-source all-dims)]
    (->> groups
         (mapv (fn [dims]
                 (let [head   (first dims)
                       scores (keep :dimension_interestingness dims)]
                   {:name                      (dimension-display-name head)
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
    (->> (t2/select [:model/Card :id]
                    {:where    where
                     :order-by [[[:case
                                  [:in :collection_id (or (seq library-ids) [-1])] 0
                                  :else 1] :asc]
                                [:name :asc]]})
         (mapv :id))))

(defn- load-metric-cards
  "Load the metric Card rows for `card-ids` in a single batched SELECT, returning them
   in the same order as `card-ids`. Only the columns we actually need downstream are
   projected — the full Card row is many KB per metric (result_metadata,
   visualization_settings, dataset_query, etc.) and dominates response size."
  [card-ids]
  (when (seq card-ids)
    (let [rows   (t2/select (into [:model/Card] metric-card-cols)
                            :id [:in card-ids]
                            :type "metric")
          by-id  (u/index-by :id rows)]
      (into [] (keep by-id) card-ids))))

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
    (let [mappings-by-id (u/index-by :dimension_id (:dimension_mappings metric))
          keep?          (fn [dim]
                           (if-let [target (get-in mappings-by-id [(:id dim) :target])]
                             (and (some? query) (target-resolvable? query breakoutable target))
                             true))
          kept-dims      (filterv keep? (:dimensions metric))
          kept-ids       (into #{} (map :id) kept-dims)]
      (-> metric
          (assoc :dimensions kept-dims)
          (update :dimension_mappings
                  (fn [ms] (filterv #(contains? kept-ids (:dimension_id %)) ms)))))))

(defn- slim-metric
  "Drop a hydrated metric's inline `:dimensions`, exposing just their ids as `:dimension_ids`
   (the shape the FE picker consumes)."
  [m]
  (-> m
      (assoc :dimension_ids (mapv :id (:dimensions m)))
      (dissoc :dimensions)))

(defn- hydrated-metrics
  "Permission-filtered, interestingness-annotated metric Cards with their candidate dimensions
   inlined as `:dimensions`, restricted to `:metric-ids` (or all visible when nil) and optionally
   filtered by search `:q`. Shared by [[exploration-data]], [[research-candidates]], and
   [[research-groups]]."
  [{:keys [metric-ids q]}]
  (lib-be/with-metadata-provider-cache
    (let [library-ids (or (library-metrics-collection-ids) #{})
          card-ids   (accessible-metric-ids metric-ids library-ids)
          cards      (load-metric-cards card-ids)
          ;; Filter dimensions by user permissions for all metrics at once (one set of queries
          ;; for the whole batch, rather than per metric).
          permitted  (metrics/filter-dimensions-for-user-batch cards)
          resolve-breakoutable (make-breakoutable-resolver)
          hydrated   (->> permitted
                          (mapv (fn [m]
                                  ;; Build the metric's query once and reuse it for resolving
                                  ;; dimension targets and computing the result column name.
                                  ;; Breakoutable columns (the dominant cost) are shared across
                                  ;; metrics that query the same table.
                                  (let [query        (metric-query m)
                                        breakoutable (resolve-breakoutable m query)]
                                    (-> m
                                        (filter-resolvable-dimensions query breakoutable)
                                        (assoc :result_column_name (result-column-name query)
                                               :in_library (contains? library-ids (:collection_id m)))
                                        ;; dataset_query was only needed to build `query`.
                                        (dissoc :dataset_query)))))
                          (metrics/annotate-dimensions-with-field-data [:dimension_interestingness]))]
      (if (str/blank? q)
        hydrated
        (let [q-lower (u/lower-case-en q)]
          (filterv #(metric-matches-search? % q-lower) hydrated))))))

(defn- candidate-dimension?
  "Whether a dimension is surfaced as a research candidate: it scored at or above
   [[min-interestingness]], or it didn't score (nil). Mirrors the filter [[group-dimensions]]
   applies, so a metric's candidate dimensions match the dimension groups exactly."
  [d]
  (let [score (:dimension_interestingness d)]
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

(def ^:private llm-dimension-cols
  "Dimension fields surfaced to Metabot in the research catalog."
  [:id :name :display_name :effective_type :semantic_type :dimension_interestingness])

(defn research-candidates
  "Metabot-facing research catalog: each metric with its candidate dimensions inlined
   (`:id`, `:name`, `:dimension_interestingness`, ...), plus dimension groups annotated with the
   dimension ids they bundle and the metric ids they can slice. Shaped for the
   `get_research_candidates` tool so the LLM can pick valid metric/dimension ids before authoring
   groups; the FE does not consume this. Accepts the same `:metric-ids`/`:q` options as
   [[exploration-data]]."
  [opts]
  (let [filtered     (mapv with-candidate-dimensions (hydrated-metrics opts))
        dim->metrics (dimension-id->metric-ids filtered)]
    {:metrics          (mapv (fn [m]
                               (assoc (select-keys m llm-metric-cols)
                                      :dimensions (mapv #(select-keys % llm-dimension-cols)
                                                        (:dimensions m))))
                             filtered)
     :dimension_groups (mapv (fn [g]
                               (let [dim-ids (mapv :id (:dimensions g))]
                                 {:name                      (:name g)
                                  :dimension_interestingness (:dimension_interestingness g)
                                  :dimension_ids             dim-ids
                                  :metric_ids                (into [] (distinct)
                                                                   (mapcat dim->metrics dim-ids))}))
                             (group-dimensions filtered))}))

(defn research-groups
  "Validate Metabot's chosen research groups and return the FE picker payload for them.

   `:groups` is a sequence of maps, each either
     `{:anchor \"metric\"    :metric_id <int> :dimension_ids [<str> ...]}` (`:dimension_ids` optional)
   or `{:anchor \"dimension\" :dimension_id <str>}`.

   Hard-errors (throws) on any unknown/inaccessible metric id, unknown dimension id, or a
   dimension id that isn't a candidate of its metric — one bad id fails the whole batch.

   On success returns `{:metrics [...] :dimension_groups [...] :groups [...]}`, where
   `:metrics`/`:dimension_groups` are the [[exploration-data]] hydration restricted to the
   referenced metrics (a metric anchor pulls its metric; a dimension anchor pulls every metric
   exposing any dimension in that dimension's group), and `:groups` echoes the validated specs
   for the FE to turn into picker blocks."
  [{:keys [groups]}]
  (let [all          (mapv with-candidate-dimensions (hydrated-metrics {}))
        metric-by-id (u/index-by :id all)
        dim->metrics (dimension-id->metric-ids all)
        all-dim-ids  (set (keys dim->metrics))
        ;; dimension id -> the set of dimension ids in its group (same-source bundle)
        dim->group   (into {} (mapcat (fn [g]
                                        (let [ids (set (map :id (:dimensions g)))]
                                          (map (fn [id] [id ids]) ids)))
                                      (group-dimensions all)))]
    (doseq [g groups]
      (case (:anchor g)
        "metric"
        (let [metric-id (:metric_id g)
              metric    (get metric-by-id metric-id)]
          (when (nil? metric-id)
            (throw (ex-info "A metric-anchored group requires a metric_id" {:group g})))
          (when-not metric
            (throw (ex-info (format "Unknown or inaccessible metric id %s" metric-id)
                            {:anchor "metric" :metric_id metric-id})))
          (when (and (:replace_default_dimensions g) (empty? (:dimension_ids g)))
            (throw (ex-info "replace_default_dimensions requires at least one dimension_id"
                            {:anchor "metric" :metric_id metric-id})))
          (let [valid (set (map :id (:dimensions metric)))]
            (doseq [d (:dimension_ids g)]
              (when-not (contains? valid d)
                (throw (ex-info (format "Dimension %s is not a candidate of metric %s" d metric-id)
                                {:anchor "metric" :metric_id metric-id :dimension_id d}))))))
        "dimension"
        (let [dimension-id (:dimension_id g)]
          (when (nil? dimension-id)
            (throw (ex-info "A dimension-anchored group requires a dimension_id" {:group g})))
          (when-not (contains? all-dim-ids dimension-id)
            (throw (ex-info (format "Unknown dimension id %s" dimension-id)
                            {:anchor "dimension" :dimension_id dimension-id})))
          (when-let [mids (seq (:metric_ids g))]
            (let [related (into #{} (mapcat dim->metrics) (dim->group dimension-id))]
              (doseq [mid mids]
                (when-not (contains? related mid)
                  (throw (ex-info (format "Metric %s is not related to dimension %s" mid dimension-id)
                                  {:anchor "dimension" :dimension_id dimension-id :metric_id mid})))))))
        (throw (ex-info (format "Unknown anchor %s" (:anchor g)) {:group g}))))
    (let [relevant         (reduce (fn [acc g]
                                     (case (:anchor g)
                                       "metric"    (conj acc (:metric_id g))
                                       "dimension" (let [related (into #{} (mapcat dim->metrics)
                                                                       (dim->group (:dimension_id g)))]
                                                     (into acc (if-let [mids (seq (:metric_ids g))]
                                                                 (filter related mids)
                                                                 related)))))
                                   #{} groups)
          relevant-metrics (filterv #(contains? relevant (:id %)) all)]
      {:metrics          (mapv slim-metric relevant-metrics)
       :dimension_groups (group-dimensions relevant-metrics)
       :groups           (vec groups)})))
