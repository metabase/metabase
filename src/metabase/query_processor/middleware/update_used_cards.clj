(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [clojure.set :as set]
   [grouper.core :as grouper]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- update-used-cards!*
  [seq-of-used-card-ids]
  (let [card-ids (apply set/union seq-of-used-card-ids)]
    (log/debugf "Update last_used_at of %d cards" (count card-ids))
    (try
      ;; instead of updating each card with the timestmap that it was submited from the QP
      ;; we update all cards with last_used_at = now to save db calls
      ;; This value is not required to be accurate
      (t2/update! :model/Card :id [:in card-ids] {:last_used_at :%now})
      (catch Throwable e
        (log/error e "Error updating used cards")))))

(def ^{:private true
       :once    true}
  update-used-cards-queue
  (grouper/start!
   update-used-cards!*
   :capacity 500
   :interval (* 5 60 1000)))

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
              (grouper/submit! update-used-cards-queue (set (lib.metadata/invoked-ids metadata :metadata/card)))
              (rff metadata))]
      (qp query rff*))))
