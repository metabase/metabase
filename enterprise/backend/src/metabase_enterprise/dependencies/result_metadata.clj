(ns metabase-enterprise.dependencies.result-metadata
  "Re-derives the result metadata of the MBQL cards that transitively depend on entities whose result columns changed,
  marking the stale entities' dependents up front and processing each after its upstream entities, without re-deriving
  or passing native cards, whose result metadata comes from running them."
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.result-metadata-status :as deps.result-metadata-status]
   [metabase.lib.core :as lib]
   [metabase.queries.core :as queries]
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

(defn result-metadata-changed?
  "Whether the result metadata `before` and `after` differ in what the queries using the card as a source see."
  [before after]
  (not= (lib/comparable-column-metadata before compared-column-keys)
        (lib/comparable-column-metadata after compared-column-keys)))

(defn- mark-transitive-dependents-stale!
  "Mark the MBQL cards and measures that transitively depend on the stale entities stale, without passing native
  cards, so processing them never has to mark anything."
  []
  (when-let [stale (not-empty (deps.result-metadata-status/stale-statuses))]
    (deps.result-metadata-status/mark-dependents-stale!
     (models.dependency/transitive-mbql-dependents
      (models.dependency/filtered-graph-dependents {:types derived-through-types})
      (models.dependency/group-nodes (map (juxt :entity_type :entity_id) stale))))))

(defn- update-card-result-metadata!
  "Re-derive the result metadata of the MBQL card with `card-id`, and store it when what the queries using the card
  see changed and the card was not updated meanwhile. Returns whether it stored it."
  [card-id]
  (let [{query :dataset_query, :as card} (dependencies.db/card card-id)]
    (boolean
     (when (and (seq query) (not (lib/any-native-stage? query)))
       (when-let [metadata (queries/infer-metadata-with-model-overrides query card)]
         (when (result-metadata-changed? (:result_metadata card) metadata)
           (pos? (dependencies.db/set-card-result-metadata! card-id (:updated_at card) metadata))))))))

(defn- process-status!
  "Re-derive the result metadata of the stale entity `status` when it is a card, then clear it, unconditionally when
  storing the result metadata marked it again, since its dependents were marked before processing started."
  [{:keys [entity_type entity_id] :as status}]
  (t2/with-transaction [_]
    (if (and (= entity_type :card) (update-card-result-metadata! entity_id))
      (deps.result-metadata-status/clear-stale! status)
      (deps.result-metadata-status/clear-stale-if-unchanged! status))))

(defn- process-status-or-record-failure!
  "Process the stale entity `status`, recording a failure instead of throwing one."
  [status retry-delay-minutes]
  (try
    (process-status! status)
    (catch Throwable e
      (log/warnf "Failed to re-derive the result metadata depending on %s %s: %s"
                 (name (:entity_type status)) (:entity_id status) (ex-message e))
      (deps.result-metadata-status/record-failure! status max-retries retry-delay-minutes)
      (when-not (instance? Exception e)
        (throw e)))))

(defn update-result-metadata!
  "Process up to `batch-size` stale entities, re-deriving the result metadata of the MBQL cards depending on them, and
  return how many were processed."
  [batch-size retry-delay-minutes]
  (deps.result-metadata-status/remove-deleted!)
  (mark-transitive-dependents-stale!)
  (loop [remaining batch-size]
    (let [statuses (when (pos? remaining)
                     (deps.result-metadata-status/statuses-to-process remaining))]
      (if (empty? statuses)
        (- batch-size remaining)
        (do
          (doseq [status statuses]
            (process-status-or-record-failure! status retry-delay-minutes))
          (recur (- remaining (count statuses))))))))
