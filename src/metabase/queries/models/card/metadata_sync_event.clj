(ns metabase.queries.models.card.metadata-sync-event
  "Events for asynchronous result_metadata synchronization."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.interface :as mi]
   [metabase.queries.models.card.dependencies :as card.dependencies]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ResultMetadataSyncEvent [_model] :result_metadata_sync_event)

(doto :model/ResultMetadataSyncEvent
  (derive :metabase/model)
  (derive ::t2.disallow/update))

(t2/deftransforms :model/ResultMetadataSyncEvent
  {:type mi/transform-keyword})

(defn- emit-events
  [event-type reference-ids]
  (when (seq reference-ids)
    (t2/insert-returning-pks! :model/ResultMetadataSyncEvent
                              (map (fn [reference-id]
                                     {:type event-type
                                      :reference_id reference-id})
                                   reference-ids))))

(defn emit-table-changed-events!
  "Emit a table-changed event for each of the IDs in `table-ids`."
  [table-ids]
  (emit-events :table-changed table-ids))

(defn emit-card-changed-events!
  "Emit a card-changed event for each of the IDs in `card-ids`."
  [card-ids]
  (emit-events :card-changed card-ids))

(defn emit-card-needs-refresh-events!
  "Emit a card-needs-refresh event for each of the IDs in `card-ids`."
  [card-ids]
  (emit-events :card-needs-refresh card-ids))

(defn- delete-events!
  [ids]
  (when (seq ids)
    (t2/delete! :model/ResultMetadataSyncEvent :id [:in ids])))

(defn- fetch-events
  [n]
  (t2/select :model/ResultMetadataSyncEvent
             {:order-by [:id]
              :limit n
              :for (cond-> [:update]
                     (not= (app-db/db-type) :h2) (conj :skip-locked))}))

(defmulti handle-event
  {:private true :arglists '([card-sync-event])}
  :type)

(defmethod handle-event :table-changed
  [{:keys [reference_id]}]
  (-> (card.dependencies/cards-depending-on-table reference_id)
      emit-card-needs-refresh-events!))

(defmethod handle-event :card-changed
  [{:keys [reference_id]}]
  (-> (card.dependencies/cards-depending-on-card reference_id)
      emit-card-needs-refresh-events!))

(defmethod handle-event :card-needs-refresh
  [{:keys [reference_id]}]
  (let [{query :dataset_query, card-id :id, :as card} (t2/select-one :model/Card reference_id)
        new-metadata (card.metadata/infer-metadata-with-model-overrides query card)]
    (when (not= new-metadata (:result_metadata card))
      (t2/update! :model/Card card-id {:result_metadata new-metadata})
      (emit-card-changed-events! [card-id]))))

(defn- process-events
  "Process at most `n` events in a transaction."
  [n]
  (t2/with-transaction [_]
    (when-let [events (seq (fetch-events n))]
      (lib.metadata.jvm/with-metadata-provider-cache
        (let [start (System/currentTimeMillis)]
          (doseq [event events]
            (handle-event event))
          (delete-events! (map :id events))
          (- (System/currentTimeMillis) start))))))

(def ^:private event-processing-stats
  (atom {:count 0
         :max-duration 0
         :total-duration 0}))
(defn process-events-loop
  "Process card metadata synchronization events in an infinite loop."
  []
  (let [event-batch-size 10]
    (try
      (while true
        (let [duration (process-events event-batch-size)]
          (when duration
            (swap! event-processing-stats #(-> %
                                               (update :count inc)
                                               (update :max-duration max duration)
                                               (update :total-duration + duration))))
          (Thread/sleep (long (or duration 500)))))
      (catch Throwable t
        (log/error t "Error processing event queue, stopping")))))

(comment
  (t2/count :model/Card)
  (t2/count :model/ResultMetadataSyncEvent)
  @event-processing-stats

  (time (run! (fn [card]
                (try
                  (-> card
                      (update :dataset_query (:out mi/transform-metabase-query))
                      card.dependencies/update-dependencies-for-card!)
                  (catch Exception e
                    (if (re-find #"violates foreign key constraint" (ex-message e))
                      (log/error e "Card references missing source")
                      (throw e)))))
              (t2/reducible-query {:select [:id :dataset_query]
                                   :from [:report_card]
                                   :where [:= :archived false]})))

  (t2/delete! :model/Card->Table)
  (t2/delete! :model/Card->Card)
  (->> (t2/select-fn-vec :table_id :model/Card->Table)
       frequencies
       (sort-by (comp - val)))
  -)
