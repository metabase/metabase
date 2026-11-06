(ns metabase-enterprise.dependencies.models.result-metadata-status
  "The ResultMetadataStatus model: one status per MBQL card, marked stale by the writes its result metadata reads."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ResultMetadataStatus [_model] :result_metadata_status)

(derive :model/ResultMetadataStatus :metabase/model)

(t2/deftransforms :model/ResultMetadataStatus
  {:entity_type mi/transform-keyword})

(def current-result-metadata-version
  "Current version of the result metadata logic. Increment it when the logic changes, so the job processes every
  entity again.

  Version history:
  - 1: Initial version"
  1)
