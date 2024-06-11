(ns metabase.models.searchable
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Searchable [_model] :search)

(derive :model/Searchable :metabase/model)
