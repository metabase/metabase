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
   [metabase.lib-metric.core :as lib-metric]
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

(defn- group-dimensions
  "Collapse dimensions across the supplied metrics into a list of dimension groups. Dimensions that
   share the same underlying source (per `lib-metric/same-source?`) collapse into a single
   group. Each group exposes the user-facing combination name, a representative interestingness, and
   the list of underlying dimensions that callers must echo back to `POST /api/exploration` when
   the user starts an exploration."
  [metrics]
  (let [all-dims (->> (mapcat :dimensions metrics)
                      (filter (fn [d]
                                (let [score (:dimension_interestingness d)]
                                  (or (nil? score)
                                      (>= score min-interestingness))))))
        buckets  (reduce (fn [acc d]
                           (if-let [idx (some (fn [[i bucket]]
                                                (when (some #(lib-metric/same-source? % d) bucket)
                                                  i))
                                              (map-indexed vector acc))]
                             (let [bucket (acc idx)]
                               (if (some #(= (:id %) (:id d)) bucket)
                                 acc
                                 (update acc idx conj d)))
                             (conj acc [d])))
                         []
                         all-dims)
        groups   (mapv (fn [bucket]
                         (let [head   (first bucket)
                               scores (keep :dimension_interestingness bucket)]
                           {:name                      (dimension-display-name head)
                            :dimension_interestingness (when (seq scores) (apply max scores))
                            :dimensions                (vec bucket)}))
                       buckets)]
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
  (let [card-ids  (accessible-metric-ids metric-ids)
        hydrated  (->> card-ids
                       (mapv (fn [id]
                               (metrics/sync-dimensions! :metadata/metric id)
                               (-> (t2/select-one :model/Card :id id :type "metric")
                                   metrics/filter-dimensions-for-user
                                   with-result-column-name)))
                       (metrics/annotate-dimensions-with-field-data [:dimension_interestingness]))
        filtered  (if (str/blank? q)
                    hydrated
                    (let [q-lower (u/lower-case-en q)]
                      (filterv #(metric-matches-search? % q-lower) hydrated)))
        slimmed   (mapv (fn [m]
                          (-> m
                              (assoc :dimension_ids (mapv :id (:dimensions m)))
                              (dissoc :dimensions)))
                        filtered)]
    {:metrics          slimmed
     :dimension_groups (group-dimensions filtered)}))
