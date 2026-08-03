(ns metabase.queries.models.stored-result
  "Cached query result snapshots. A `stored_result` row holds the serialized bytes a worker
  produced for one execution of a `dataset_query`, plus the bookkeeping the read path needs
  (`creator_id`, `database_id`, `dataset_query`) to gate cached-read permissions. Lives in the
  queries module because the snapshot is tied to a query/card, not to any one feature that
  produced it."
  (:require
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResult [_model] :stored_result)

(t2/deftransforms :model/StoredResult
  {:result_data       mi/transform-secret-value
   :dataset_query     mi/transform-json
   :data_access_token perms/data-access-token-transform})

(doto :model/StoredResult
  (derive :metabase/model)
  (derive :hook/timestamped?))
