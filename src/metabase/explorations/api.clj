(ns metabase.explorations.api
  "`/api/exploration` routes."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------- helpers -----------------------------------------

(defn- get-exploration-or-404 [id]
  (api/check-404 (t2/select-one :model/Exploration :id id)))

(defn- hydrate-exploration [exploration]
  (-> exploration
      (t2/hydrate :creator
                  [:threads :metrics :dimensions :timelines :queries])))

(defn- find-dimension-target
  "Look up the MBQL `target` for a dimension by ID inside a metric's snapshotted dimension_mappings."
  [dimension-id dimension-mappings]
  (some #(when (= (or (:dimension_id %) (get % "dimension_id")) dimension-id)
           (or (:target %) (get % "target")))
        dimension-mappings))

(defn- build-snapshot-mbql
  "Build a snapshot MBQL by taking the metric Card's dataset_query and adding breakouts for the
  given dimensions. Each dimension's `target` is read from the metric selection's
  snapshotted `dimension_mappings`."
  [card-dataset-query dimension-ids dimension-mappings]
  (let [breakouts (->> dimension-ids
                       (keep #(find-dimension-target % dimension-mappings))
                       vec)]
    (cond-> card-dataset-query
      (seq breakouts) (assoc-in [:query :breakout] breakouts))))

(defn- generate-queries!
  "Materialize the (metric × dimension) matrix as one `exploration_query` row per pair, each
  ready for the worker to execute."
  [thread-id metrics dimensions]
  (when (and (seq metrics) (seq dimensions))
    (let [cards   (t2/select-pk->fn identity [:model/Card :id :dataset_query :card_schema]
                                    :id [:in (distinct (map :card_id metrics))])
          dim-cnt (count dimensions)
          rows    (for [[i metric] (map-indexed vector metrics)
                        [j dim]    (map-indexed vector dimensions)
                        :let [card-q   (some-> (get cards (:card_id metric)) :dataset_query)
                              dim-id   (:dimension_id dim)
                              snapshot (when card-q
                                         (build-snapshot-mbql card-q [dim-id] (:dimension_mappings metric)))]]
                    {:exploration_thread_id thread-id
                     :card_id               (:card_id metric)
                     :dimension_id          dim-id
                     :dataset_query         (or snapshot {})
                     :status                "pending"
                     :position              (+ (* i dim-cnt) j)})]
      (t2/insert! :model/ExplorationQuery rows))))

;;; ----------------------------------------- schemas -----------------------------------------

(def ^:private MetricSelection
  [:map
   [:card_id ms/PositiveInt]
   [:dimension_mappings {:optional true} [:maybe [:sequential :map]]]])

(def ^:private DimensionSelection
  [:map
   [:dimension_id   ms/NonBlankString]
   [:display_name   {:optional true} [:maybe :string]]
   [:effective_type {:optional true} [:maybe :string]]
   [:semantic_type  {:optional true} [:maybe :string]]])

(def ^:private CreateExploration
  [:map
   [:name         ms/NonBlankString]
   [:description  {:optional true} [:maybe :string]]
   [:prompt       {:optional true} [:maybe :string]]
   [:metrics      {:optional true} [:maybe [:sequential MetricSelection]]]
   [:dimensions   {:optional true} [:maybe [:sequential DimensionSelection]]]
   [:timeline_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

;;; ----------------------------------------- endpoints -----------------------------------------

(api.macros/defendpoint :post "/"
  "Create a new exploration with a single thread, persist the user's selected metrics, dimensions,
  and timelines, and materialize one `exploration_query` per (metric, dimension) pair. The query
  rows are inserted with status='pending' for the worker to execute. This is the single
  \"Start exploration\" call from the UI."
  [_route-params
   _query-params
   {:keys [name description prompt metrics dimensions timeline_ids]} :- CreateExploration]
  (t2/with-transaction [_]
    (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                             {:name        name
                                                              :description description
                                                              :creator_id  api/*current-user-id*}))
          thread      (first (t2/insert-returning-instances! :model/ExplorationThread
                                                             {:exploration_id (:id exploration)
                                                              :prompt         prompt
                                                              :position       0}))
          tid         (:id thread)
          metric-rows (when (seq metrics)
                        (t2/insert-returning-instances!
                         :model/ExplorationThreadMetric
                         (map-indexed (fn [i m]
                                        (assoc m
                                               :exploration_thread_id tid
                                               :position i))
                                      metrics)))]
      (when (seq dimensions)
        (t2/insert! :model/ExplorationThreadDimension
                    (map-indexed (fn [i d]
                                   (assoc d
                                          :exploration_thread_id tid
                                          :position i))
                                 dimensions)))
      (when (seq timeline_ids)
        (t2/insert! :model/ExplorationThreadTimeline
                    (map-indexed (fn [i tl-id]
                                   {:exploration_thread_id tid
                                    :timeline_id           tl-id
                                    :position              i})
                                 timeline_ids)))
      (generate-queries! tid metric-rows dimensions)
      (t2/update! :model/ExplorationThread tid {:started_at (t/offset-date-time)})
      (hydrate-exploration (t2/select-one :model/Exploration :id (:id exploration))))))

(api.macros/defendpoint :get "/:id"
  "Fetch an exploration with its thread, selections, and generated queries."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [expl (api/read-check (get-exploration-or-404 id))]
    (hydrate-exploration expl)))

;;; ----------------------------------------- routes -----------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/exploration/` routes."
  (api.macros/ns-handler *ns* +auth))
