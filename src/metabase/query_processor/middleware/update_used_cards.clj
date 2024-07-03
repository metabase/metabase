(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [grouper.core :as grouper]
   [java-time.api :as t]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- update-used-cards!*
  [card-id-timestamps]
  (let [card-id->timestamp (update-vals (group-by :id card-id-timestamps)
                                        (fn [xs] (apply t/max (map :timestamp xs))))]
    (log/debugf "Update last_used_at of %d cards" (count card-id->timestamp))
    (try
      (t2/update! :model/Card :id [:in (keys card-id->timestamp)]
                  {:last_used_at (into [:case]
                                       (apply concat (for [[id timestamp] card-id->timestamp]
                                                       [[:= :id id] [:greatest [:coalesce :last_used_at 0] timestamp]])))})
      (catch Throwable e
        (log/error e "Error updating used cards")))))

(defonce ^:private
  update-used-cards-queue
  (delay
   (grouper/start!
    update-used-cards!*
    :capacity 500
    :interval (* 5 60 1000))))

(mu/defn update-used-cards! :- ::qp.schema/qp
  "Middleware that get all card-ids that were used during a query execution and updates their `last_used_at`.
  Should be used after query is fully preprocessed.

  Including but not limited to cards used as:
  - the source card for other queries
  - definition for sandbox rules
  - card references in native query
  - dashcard on dashboard
  - alert/pulse"
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::qp.schema/query
          rff   :- ::qp.schema/rff]
    (letfn [(rff* [metadata]
              (doseq [card-id (set (lib.metadata/invoked-ids (qp.store/metadata-provider) :metadata/card))]
                (grouper/submit! @update-used-cards-queue {:id   card-id
                                                           :timestamp (t/offset-date-time)}))
              (rff metadata))]
      (qp query rff*))))
