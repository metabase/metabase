(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [metabase.lib.metadata.protocols :as lib.protocols]
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
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::qp.schema/query
          rff   :- ::qp.schema/rff]
    (letfn [(rff* [metadata]
             (update-used-cards!* (lib.protocols/called-ids (qp.store/metadata-provider) :metadata/card))
             (rff metadata))]
      (qp query rff*))))
