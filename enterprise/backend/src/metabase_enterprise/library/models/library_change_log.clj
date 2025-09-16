(ns metabase-enterprise.library.models.library-change-log
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/LibraryChangeLog [_model] :library_change_log)

(derive :model/LibraryChangeLog :metabase/model)
