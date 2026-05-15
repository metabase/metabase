(ns metabase.documents.models.stored-result
  "Cached query result snapshots referenced by static `cardEmbed` nodes. Decoupled from any one
  feature so future tools can write static charts without going through explorations."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/StoredResult [_model] :stored_result)

(t2/deftransforms :model/StoredResult
  {:dataset_query          mi/transform-json
   :display                mi/transform-keyword
   :visualization_settings mi/transform-visualization-settings
   :result_data            mi/transform-secret-value})

(doto :model/StoredResult
  (derive :metabase/model)
  (derive :hook/timestamped?))
