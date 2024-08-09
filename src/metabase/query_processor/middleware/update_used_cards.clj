(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.usage :as usage]
   [metabase.util.grouper :as grouper]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
    (let [rff* (fn [metadata]
                 (doseq [card-id (distinct (lib.metadata/invoked-ids (qp.store/metadata-provider) :metadata/card))]
                   (usage/track! :model/Card card-id))
                 (rff metadata))]
      (qp query rff*))))
