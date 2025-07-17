(ns metabase.queries.models.card.metadata-sync-event
  "Events for asynchronous result_metadata synchronization."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.disallow :as t2.disallow]))

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

(defn emit-table-changed-events
  [table-ids]
  (emit-events :table-changed table-ids))

(defn emit-card-changed-events
  [card-ids]
  (emit-events :card-changed card-ids))

(defn emit-card-needs-refresh-events
  [card-ids]
  (emit-events :card-needs-refresh card-ids))

(defn delete-events
  [ids]
  (when (seq ids)
    (t2/delete! :model/ResultMetadataSyncEvent :id [:in ids])))

(defn fetch-events
  [n]
  (t2/select :model/ResultMetadataSyncEvent
             {:order-by [:id]
              :limit n
              :for (cond-> [:update]
                     (not= (app-db/db-type) :h2) (conj :skip-locked))}))

(comment
  (emit-table-changed-events (range 5))
  (emit-card-changed-events (range 5 10))
  (emit-card-needs-refresh-events (range 10 15))
  (fetch-events 7)
  (delete-events (range 1 4))
  (delete-events (range 4 11))
  -)
