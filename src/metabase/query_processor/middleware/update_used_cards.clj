(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- update-used-cards!*
  [used-card-ids]
  (when (seq used-card-ids)
    (qp.util/with-execute-async
      (fn []
        (try
          (t2/update! :model/Card :id [:in used-card-ids] {:last_used_at :%now})
          (catch Throwable e
            (log/error e "Error updating used cards")))))))

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
             (update-used-cards!* (set (lib.metadata/invoked-ids (qp.store/metadata-provider) :metadata/card)))
             (rff metadata))]
      (qp query rff*))))
