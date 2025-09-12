(ns metabase-enterprise.library.models.library-sync-log
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/LibrarySyncLog [_model] :library_sync_log)

(derive :model/LibrarySyncLog :metabase/model)