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
   [metabase.queries.models.card :as card]
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

(defn- metric-matches-search? [metric q-lower]
  (or (str/includes? (u/lower-case-en (or (:name metric) "")) q-lower)
      (some (fn [d]
              (str/includes? (u/lower-case-en (or (:display_name d) "")) q-lower))
            (:dimensions metric))))

(defn- dimension-display-name
  "Combination name shown in the UI for a dimension: '<group display name> - <dimension display name>'
   when the dimension has a group, otherwise just the dimension's display name."
  [d]
  (let [dn       (or (:display_name d) (:name d) "")
        group-dn (some-> d :group :display_name)]
    (if (str/blank? group-dn)
      dn
      (str group-dn " - " dn))))

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
  "Card ids the current user can read, ordered with library-metrics collections first
   then alphabetically by name. Optionally restricted to `metric-ids` (when non-nil),
   preserving access checks but filtering to that subset."
  [metric-ids]
  (let [library-ids (library-metrics-collection-ids)
        base-where  (card/visible-metric-cards-where-clause)
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

(defn exploration-data
  "Returns the data shape used by `GET /api/exploration/dimensions`, the metabot
   `select_exploration_metrics` tool, and any other caller that needs the
   modal-ready hydrated metrics + grouped dimensions.

   - `:metric-ids` (optional) — when non-nil, restricts the result to those metric Card
     ids the user can read. When nil, returns all visible metric Cards.
   - `:q` (optional) — case-insensitive search across metric name and dimension display-name.

   The returned shape is `{:metrics [...] :dimension_groups [...]}` exactly matching the
   `::DimensionsResponse` schema in `metabase.explorations.api`."
  [{:keys [metric-ids q]}]
  (lib-be/with-metadata-provider-cache
    (let [library-ids (or (library-metrics-collection-ids) #{})
          card-ids   (accessible-metric-ids metric-ids)
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
                                        (assoc :result_column_name (result-column-name query))
                                        ;; dataset_query was only needed to build `query`.
                                        (dissoc :dataset_query)))))
                          (metrics/annotate-dimensions-with-field-data [:dimension_interestingness]))
          filtered   (if (str/blank? q)
                       hydrated
                       (let [q-lower (u/lower-case-en q)]
                         (filterv #(metric-matches-search? % q-lower) hydrated)))
          slimmed    (mapv (fn [m]
                             (-> m
                                 (assoc :dimension_ids (mapv :id (:dimensions m))
                                        :in_library (contains? library-ids (:collection_id m)))
                                 (dissoc :dimensions)))
                           filtered)]
      {:metrics          slimmed
       :dimension_groups (group-dimensions filtered)})))
