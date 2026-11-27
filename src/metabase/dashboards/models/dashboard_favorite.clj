(ns metabase.dashboards.models.dashboard-favorite
  "A legacy favorite of a Dashboard, which no code writes any more."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/DashboardFavorite [_model] :dashboard_favorite)

(doto :model/DashboardFavorite
  (derive :metabase/model)
  (derive :hook/worktree-id))

(defmethod app-db-copy/spec :model/DashboardFavorite [_model]
  {:skip? true})
