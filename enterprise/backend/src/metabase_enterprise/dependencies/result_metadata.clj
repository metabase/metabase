(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards that transitively depend on entities whose result columns changed,
  marking the stale entities' dependents up front and processing each after its upstream entities, without re-deriving
  or passing native cards, whose result metadata comes from running them."
  (:require
   [clojure.walk :as walk]
   [malli.error :as me]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase.graph.core :as graph]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.queries.core :as queries]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-retries 5)

(def ^:private compared-column-keys
  "The result metadata column keys that the queries using a card as a source see."
  [:name :display_name :description :semantic_type :fk_target_field_id :id :settings :visibility_type
   :base_type :effective_type :unit :inherited_temporal_unit])

(def ^:private type-column-keys
  "The result metadata column keys a run of the card refines within the type that inference gets right."
  [:base_type :effective_type :database_type])

(defn- normalize-column
  "The result metadata column `col` with its unqualified keys in snake_case."
  [col]
  (update-keys col #(cond-> % (not (qualified-keyword? %)) u/->snake_case_en)))

(defn- comparable-metadata
  "The [[compared-column-keys]] of the result metadata `cols` with a value, with keyword values as strings."
  [cols]
  (mapv (fn [col]
          (into {}
                (keep (fn [k]
                        (when-some [v (get col k)]
                          [k (walk/postwalk #(cond-> % (keyword? %) u/qualified-name) v)])))
                compared-column-keys))
        cols))

(defn- same-root-type?
  "Whether the types `x` and `y` share an ancestor below `:type/*`, like integers and decimals do."
  [x y]
  (and x y (not= :type/* (types/most-specific-common-ancestor (keyword x) (keyword y)))))

(defn- patch-result-metadata
  "The inferred result metadata `inferred`, each column keeping the fingerprint of the stored column of `stored` it
  stands for, and its types too when they share a root type with the inferred ones, since a run measures those."
  [stored inferred]
  (let [stored-column (lib/stored-column-matcher stored)]
    (mapv (fn [col]
            (if-let [stored-col (stored-column col)]
              (cond-> col
                (some? (:fingerprint stored-col))
                (assoc :fingerprint (:fingerprint stored-col))

                (same-root-type? (:base_type stored-col) (:base_type col))
                (merge (select-keys stored-col type-column-keys)))
              col))
          inferred)))

(def ^:private query-batch-size
  "The number of entities read or walked per query, below the bind-parameter limits of every app DB."
  1000)

(defn- native-card?
  "Whether `card` has a native stage, so its result metadata comes from running it."
  [card]
  (boolean (some-> card :dataset_query not-empty lib/any-native-stage?)))

(defn- native-card-ids
  "The IDs of the native cards among `card-ids`."
  [card-ids]
  (into #{}
        (comp (mapcat #(dependencies.db/instances :card (set %)))
              (filter native-card?)
              (map :id))
        (partition-all query-batch-size card-ids)))

(defn- mbql-dependents-graph
  "The graph of the dependents of entities through MBQL cards and measures, queried in batches."
  []
  (let [dependents (models.dependency/filtered-graph-dependents {:types deps.result-metadata-status/derived-types})]
    (reify graph/Graph
      (children-of [_ key-seq]
        (let [children (into {} (map #(graph/children-of dependents %)) (partition-all query-batch-size key-seq))
              native   (native-card-ids (for [[_ nodes] children
                                              [entity-type id] nodes
                                              :when (= entity-type :card)]
                                          id))]
          (update-vals children (fn [nodes]
                                  (into #{} (remove (fn [[entity-type id]] (and (= entity-type :card) (native id))))
                                        nodes))))))))

(defn- mark-transitive-dependents-stale!
  "Mark as stale the MBQL cards and measures that transitively depend on stale entities, without passing native
  cards."
  []
  (when-let [stale (not-empty (deps.result-metadata-status/stale-statuses))]
    (deps.result-metadata-status/mark-dependents-stale!
     (models.dependency/group-nodes
      (graph/transitive (mbql-dependents-graph) (mapv (juxt :entity_type :entity_id) stale))))))

(defn- rederived-result-metadata
  "The re-derived result metadata of the MBQL `card`, inferred as its creator so their sandboxes apply, or nil when
  what the queries using it see is unchanged."
  [{query :dataset_query, stored :result_metadata, :keys [id creator_id], :as card}]
  (let [stored   (mapv normalize-column stored)
        metadata (patch-result-metadata
                  stored
                  (or (queries/infer-metadata-with-model-overrides query card creator_id)
                      (throw (ex-info "Could not infer the result metadata of the card" {:card-id id}))))]
    (when (not= (comparable-metadata stored) (comparable-metadata metadata))
      (when-let [error (me/humanize (mr/explain ::lib.schema.metadata/card.result-metadata metadata))]
        (throw (ex-info "Invalid re-derived result metadata" {:card-id id :error error})))
      metadata)))

(defn- process-status!
  "Re-derive the result metadata of the stale entity `status` when it is an MBQL card, then, with the status and the
  card locked, store it and clear the status unless it was marked again, returning `:conflict` without doing either
  when the card changed since it was read."
  [{:keys [id entity_type entity_id] :as status}]
  (let [card     (when (= entity_type :card) (dependencies.db/card entity_id))
        metadata (when (and card (not (native-card? card)) (seq (:dataset_query card)))
                   (rederived-result-metadata card))]
    (t2/with-transaction [_]
      (dependencies.db/lock-result-metadata-status id)
      (if (and card (not= (select-keys card [:updated_at :result_metadata])
                          (when (dependencies.db/lock-card! entity_id)
                            (select-keys (dependencies.db/card entity_id) [:updated_at :result_metadata]))))
        :conflict
        (do
          (when metadata
            (dependencies.db/set-card-result-metadata! entity_id metadata))
          (deps.result-metadata-status/clear-stale-if-unchanged! status)
          :processed)))))

(defn- process-status-or-record-failure!
  "Process the stale entity `status`, recording an Exception as a failure and rethrowing any other Throwable after
  recording it, returning `:conflict`, `:processed` or `:failed`."
  [status retry-delay-minutes]
  (try
    (process-status! status)
    (catch Throwable e
      (log/warnf "Failed to re-derive the result metadata of %s %s: %s"
                 (name (:entity_type status)) (:entity_id status) (ex-message e))
      (try
        (deps.result-metadata-status/record-failure! status max-retries retry-delay-minutes)
        (catch Exception record-e
          (log/warnf "Failed to record the failure for %s %s: %s"
                     (name (:entity_type status)) (:entity_id status) (ex-message record-e))))
      (when-not (instance? Exception e)
        (throw e))
      :failed)))

(defn update-result-metadata!
  "Process up to `batch-size` stale entities, re-deriving the result metadata of the MBQL cards among them, and return
  how many were processed, leaving the ones whose card changed meanwhile for the next run."
  [batch-size retry-delay-minutes]
  (deps.result-metadata-status/remove-deleted!)
  (loop [remaining batch-size, conflicts #{}]
    (let [statuses (when (pos? remaining)
                     (mark-transitive-dependents-stale!)
                     (remove (comp conflicts :id) (deps.result-metadata-status/statuses-to-process remaining)))]
      (if (empty? statuses)
        (- batch-size remaining)
        (let [results (lib-be/with-metadata-provider-cache
                        (mapv #(process-status-or-record-failure! % retry-delay-minutes) statuses))]
          (recur (- remaining (count statuses))
                 (into conflicts
                       (keep (fn [[status result]] (when (= :conflict result) (:id status))))
                       (map vector statuses results))))))))
