(ns metabase.queries.models.stored-result
  "Cached query result snapshots. A `stored_result` row holds the serialized bytes a worker
  produced for one execution of a `dataset_query`, plus the bookkeeping the read path needs
  (`creator_id`, `database_id`, `dataset_query`) to gate cached-read permissions. Many
  `report_card` rows — one per `cardEmbed` in a document — can render against the same
  snapshot; the (card, stored_result) pairing lives on the `cardEmbed` node, not in any DB
  table. Lives in the queries module because the snapshot is tied to a query/card, not to
  any one feature that produced it."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.queries.db :as queries.db]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResult [_model] :stored_result)

(t2/deftransforms :model/StoredResult
  {:result_data         (mi/transform-secret-value "stored_result.result_data")
   :dataset_query       mi/transform-json
   :data_access_token   perms/data-access-token-transform
   :resolved_source_ids query-perms/resolved-source-ids-transform})

(doto :model/StoredResult
  (derive :metabase/model)
  (derive :hook/timestamped?))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-stored-result! :- ms/PositiveInt
  "Insert the StoredResult `row` and return its id."
  [row :- ::queries.schema/stored-result.create]
  (queries.db/insert-stored-result! row))

(mu/defn delete-stored-results!
  "Delete the StoredResults with `stored-result-ids`."
  [stored-result-ids :- [:sequential ms/PositiveInt]]
  (queries.db/delete-stored-results! stored-result-ids))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/StoredResult [_model]
  {:skip? true})
