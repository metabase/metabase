(ns metabase.models.search-index
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; This table is not built by migrations, it gets built dynamically by the application (if needed).
(methodical/defmethod t2/table-name :model/SearchIndex [_model] :search_index)

(derive :model/SearchIndex :metabase/model)
