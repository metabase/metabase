(ns metabase-enterprise.database-routing.model
  (:require [toucan2.core :as t2]
            [methodical.core :as methodical]))

(methodical/defmethod t2/table-name :model/DatabaseRouter [_model] :db_router)

(doto :model/DatabaseRouter
  (derive :metabase/model))
