(ns metabase-enterprise.workspaces.models.workspace
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Workspace [_model] :workspace)

(doto :model/Workspace
  (derive :metabase/model)
  (derive :hook/timestamped?))

;;; Workspaces are admin-only for now: reading one is required to activate it
;;; (`core_user.workspace_id`), so this also keeps non-admins from entering workspaces.

(defmethod mi/can-read? :model/Workspace
  [& _]
  api/*is-superuser?*)

(defmethod mi/can-write? :model/Workspace
  [& _]
  api/*is-superuser?*)

(defmethod mi/can-create? :model/Workspace
  [_model _m]
  api/*is-superuser?*)
