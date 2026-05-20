(ns metabase.queries.models.stored-result
  "Cached query result snapshots. A `stored_result` row holds the serialized bytes a worker
  produced for one execution of a `dataset_query`, plus the bookkeeping the read path needs
  (`creator_id`, `database_id`, `dataset_query`) to gate cached-read permissions. Many
  `report_card` rows — one per `cardEmbed` in a document — can render against the same
  snapshot; the (card, stored_result) pairing lives on the `cardEmbed` node, not in any DB
  table. Lives in the queries module because the snapshot is tied to a query/card, not to
  any one feature that produced it."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResult [_model] :stored_result)

(t2/deftransforms :model/StoredResult
  {:result_data   mi/transform-secret-value
   :dataset_query mi/transform-json})

(doto :model/StoredResult
  (derive :metabase/model)
  (derive :hook/timestamped?))
