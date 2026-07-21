(ns metabase-enterprise.data-studio.models.seed
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Seed [_model] :seed)

(doto :model/Seed
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

;; All access goes through /api/ee/data-studio/seed, which is gated by
;; api/check-data-analyst; mirror that gate here.
(defmethod mi/can-read? :model/Seed
  ([_instance] (api/is-data-analyst?))
  ([_model _pk] (api/is-data-analyst?)))

(defmethod mi/can-write? :model/Seed
  ([_instance] (api/is-data-analyst?))
  ([_model _pk] (api/is-data-analyst?)))

(def non-csv-columns
  "Columns for seed list/detail reads, excluding the raw CSV payload."
  [:id :name :table_id :collection_id :csv_hash :last_synced_sha :sync_error
   :created_at :updated_at])
