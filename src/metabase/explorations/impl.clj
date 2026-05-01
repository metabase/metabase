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
   [metabase.metrics.core :as metrics]
   [metabase.queries.models.card :as card]
   [metabase.util :as u]
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

(defn- with-result-column-name [metric]
  (assoc metric :result_column_name
         (metrics/aggregation-column-name (:database_id metric) (:dataset_query metric))))

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

(defn- uf-find [parent i]
  (loop [i i]
    (let [p (get parent i)]
      (if (= p i) i (recur p)))))

(defn- uf-union [parent a b]
  (let [ra (uf-find parent a)
        rb (uf-find parent b)]
    (if (= ra rb) parent (assoc parent ra rb))))

(defn- group-dimensions
  "Collapse dimensions across the supplied metrics into a list of dimension groups. Dimensions that
   share at least one source entry are unioned into the same group (matching the semantics of
   `lib-metric/same-source?`). Each group exposes the user-facing combination name, a representative
   interestingness, and the list of underlying dimensions that callers must echo back to
   `POST /api/exploration` when the user starts an exploration."
  [metrics]
  (let [;; Flatten + filter once. Keep dims whose interestingness is nil (didn't score) or above
        ;; the threshold. Also dedupe by :id within the same source group later.
        all-dims (->> (mapcat :dimensions metrics)
                      (filter (fn [d]
                                (let [score (:dimension_interestingness d)]
                                  (or (nil? score)
                                      (>= score min-interestingness))))))
        n        (count all-dims)
        idx-dims (vec all-dims)
        ;; Build initial union-find: each dim is its own root.
        init     (vec (range n))
        ;; For every distinct source entry, union all dim indices that mention that source.
        source->idxs (reduce (fn [acc i]
                               (reduce (fn [acc src]
                                         (update acc src (fnil conj []) i))
                                       acc
                                       (:sources (idx-dims i))))
                             {}
                             (range n))
        parent       (reduce (fn [parent idxs]
                               (if (< (count idxs) 2)
                                 parent
                                 (let [a (first idxs)]
                                   (reduce (fn [p b] (uf-union p a b)) parent (rest idxs)))))
                             init
                             (vals source->idxs))
        ;; Resolve final root for each dim and collect into buckets, deduping by dim :id.
        buckets (reduce (fn [acc i]
                          (let [r (uf-find parent i)
                                d (idx-dims i)
                                seen (get-in acc [r :seen] #{})]
                            (if (contains? seen (:id d))
                              acc
                              (-> acc
                                  (update-in [r :seen] (fnil conj #{}) (:id d))
                                  (update-in [r :dims] (fnil conj []) d)))))
                        {}
                        (range n))
        groups  (mapv (fn [{:keys [dims]}]
                        (let [head   (first dims)
                              scores (keep :dimension_interestingness dims)]
                          {:name                      (dimension-display-name head)
                           :dimension_interestingness (when (seq scores) (apply max scores))
                           :dimensions                (vec dims)}))
                      (vals buckets))]
    (vec (sort-by (fn [g]
                    (if-let [score (:dimension_interestingness g)]
                      [0 (- score)]
                      [1 0]))
                  groups))))

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
          by-id  (into {} (map (juxt :id identity)) rows)]
      (into [] (keep by-id) card-ids))))

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
  (let [card-ids (accessible-metric-ids metric-ids)
        cards    (load-metric-cards card-ids)
        hydrated (->> cards
                      (mapv (fn [m]
                              (-> m
                                  metrics/filter-dimensions-for-user
                                  with-result-column-name
                                  ;; dataset_query was only needed to compute result_column_name.
                                  (dissoc :dataset_query))))
                      (metrics/annotate-dimensions-with-field-data [:dimension_interestingness]))
        filtered (if (str/blank? q)
                   hydrated
                   (let [q-lower (u/lower-case-en q)]
                     (filterv #(metric-matches-search? % q-lower) hydrated)))
        slimmed  (mapv (fn [m]
                         (-> m
                             (assoc :dimension_ids (mapv :id (:dimensions m)))
                             (dissoc :dimensions)))
                       filtered)]
    {:metrics          slimmed
     :dimension_groups (group-dimensions filtered)}))
