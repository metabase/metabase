(ns metabase-enterprise.workspaces.models.workspace-remapping
  "Toucan 2 model for the `workspace_remapping` table (workspaces v2 PoC).

   A row means: inside `workspace_id`, entity `(entity_type, source_entity_id)` is
   shadowed by `(entity_type, target_entity_id)`. An entity created *inside* the
   workspace gets a self-row (`source_entity_id = target_entity_id`) so the API can
   tell workspace-owned entities apart from untouched production ones.

   PoC note: no QP-cache invalidation hooks yet — workspace runs should bypass the
   query cache (or include the workspace id in the cache key) before this ships."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/WorkspaceRemapping [_model] :workspace_remapping)

(doto :model/WorkspaceRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/WorkspaceRemapping
  {:entity_type mi/transform-keyword})
