(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards that transitively depend on entities whose result columns changed,
  marking the stale entities' dependents up front and processing each after its upstream entities, without re-deriving
  or passing native cards, whose result metadata comes from running them."
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase.graph.core :as graph]
   [metabase.lib.core :as lib]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-retries 5)

(def ^:private derived-through-types
  "The entity types the result metadata of a card is derived through."
  #{:card :measure})

(def ^:private compared-column-keys
  "The result metadata column keys that the queries using a card as a source see, without the types, which only running
  the card gets right."
  [:name :display_name :description :semantic_type :fk_target_field_id :id :settings :visibility_type])

(defn- comparable-metadata
  "The [[compared-column-keys]] of the result metadata `cols` with a value, read in snake_case or kebab-case, with
  keyword values as strings."
  [cols]
  (mapv (fn [col]
          (into {}
                (keep (fn [k]
                        (when-some [v (get col k (get col (u/->kebab-case-en k)))]
                          [k (walk/postwalk #(cond-> % (keyword? %) u/qualified-name) v)])))
                compared-column-keys))
        cols))

(defn result-metadata-changed?
  "Whether the result metadata `before` and `after` differ in what the queries using the card as a source see."
  [before after]
  (not= (comparable-metadata before)
        (comparable-metadata after)))

(def ^:private query-batch-size
  "The number of entities read or walked per query, below the bind-parameter limits of every app DB."
  1000)

(defn- native-card-ids
  "The IDs of the native cards among `card-ids`."
  [card-ids]
  (into #{}
        (comp (mapcat #(dependencies.db/instances :card (set %)))
              (filter #(some-> % :dataset_query not-empty lib/any-native-stage?))
              (map :id))
        (partition-all query-batch-size card-ids)))

(defn- mbql-dependents
  "The MBQL cards and measures that transitively depend on the entities `nodes`, `[[entity-type entity-id]]`, through
  MBQL cards and measures only, as `{entity-type #{entity-ids}}`."
  [nodes]
  (let [graph (models.dependency/filtered-graph-dependents {:types derived-through-types})]
    (loop [frontier (set nodes), seen (set nodes), found #{}]
      (let [children (into #{}
                           (comp (mapcat #(graph/children-of graph %))
                                 (mapcat val)
                                 (remove seen))
                           (partition-all query-batch-size frontier))
            native   (native-card-ids (keep (fn [[entity-type id]] (when (= entity-type :card) id)) children))
            mbql     (into #{} (remove (fn [[entity-type id]] (and (= entity-type :card) (native id)))) children)]
        (if (empty? mbql)
          (models.dependency/group-nodes found)
          (recur mbql (into seen children) (into found mbql)))))))

(defn- mark-transitive-dependents-stale!
  "Mark the MBQL cards and measures that transitively depend on the stale entities stale, without passing native
  cards, so processing them never has to mark anything."
  []
  (when-let [stale (not-empty (deps.result-metadata-status/stale-statuses))]
    (deps.result-metadata-status/mark-dependents-stale!
     (mbql-dependents (map (juxt :entity_type :entity_id) stale)))))

(defn- update-card-result-metadata!
  "Re-derive the result metadata of the MBQL card with `card-id` and store it when what the queries using the card see
  changed, returning `:stored`, `:unchanged`, or `:conflict` when the card was updated since it was read."
  [card-id]
  (let [{query :dataset_query, :as card} (dependencies.db/card card-id)]
    (if (or (empty? query) (lib/any-native-stage? query))
      :unchanged
      (let [metadata (or (queries/infer-metadata-with-model-overrides query card)
                         (throw (ex-info "Could not infer the result metadata of the card" {:card-id card-id})))]
        (cond
          (not (result-metadata-changed? (:result_metadata card) metadata))
          :unchanged

          (pos? (dependencies.db/set-card-result-metadata! card-id (:updated_at card) metadata))
          :stored

          :else
          :conflict)))))

(defn- process-status!
  "Re-derive the result metadata of the stale entity `status` when it is a card, then clear it, unconditionally when
  storing the result metadata marked it again, and not at all when the card was updated meanwhile, so it is retried."
  [{:keys [entity_type entity_id] :as status}]
  (t2/with-transaction [_]
    (case (if (= entity_type :card) (update-card-result-metadata! entity_id) :unchanged)
      :stored    (deps.result-metadata-status/clear-stale! status)
      :unchanged (deps.result-metadata-status/clear-stale-if-unchanged! status)
      :conflict  nil)))

(defn- process-status-or-record-failure!
  "Process the stale entity `status`, recording a failure instead of throwing one."
  [status retry-delay-minutes]
  (try
    (process-status! status)
    (catch Throwable e
      (log/warnf "Failed to re-derive the result metadata depending on %s %s: %s"
                 (name (:entity_type status)) (:entity_id status) (ex-message e))
      (try
        (deps.result-metadata-status/record-failure! status max-retries retry-delay-minutes)
        (catch Exception record-e
          (log/warnf "Failed to record the failure for %s %s: %s"
                     (name (:entity_type status)) (:entity_id status) (ex-message record-e))))
      (when-not (instance? Exception e)
        (throw e)))))

(defn update-result-metadata!
  "Process up to `batch-size` stale entities, re-deriving the result metadata of the MBQL cards depending on them, and
  return how many were processed."
  [batch-size retry-delay-minutes]
  (deps.result-metadata-status/remove-deleted!)
  (loop [remaining batch-size]
    (let [statuses (when (pos? remaining)
                     (mark-transitive-dependents-stale!)
                     (deps.result-metadata-status/statuses-to-process remaining))]
      (if (empty? statuses)
        (- batch-size remaining)
        (do
          (doseq [status statuses]
            (process-status-or-record-failure! status retry-delay-minutes))
          (recur (- remaining (count statuses))))))))
