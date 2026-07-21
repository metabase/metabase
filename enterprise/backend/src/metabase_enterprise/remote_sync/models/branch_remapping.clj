(ns metabase-enterprise.remote-sync.models.branch-remapping
  "Toucan 2 model for the `branch_remapping` table.

   A row means: on git branch `branch`, entity `(entity_type, source_entity_id)`
   is shadowed by `(entity_type, target_entity_id)`. An entity created *on* the
   branch gets a self-row (`source_entity_id = target_entity_id`) so branch-owned
   entities can be told apart from untouched main ones.

   Branches are real git branches (remote sync), identified by name — there is no
   app-DB branch entity, mirroring how the rest of remote sync treats branches.

   PoC note: no QP-cache invalidation hooks yet — branch runs should bypass the
   query cache (or include the branch in the cache key) before this ships."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/BranchRemapping [_model] :branch_remapping)

(doto :model/BranchRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))

(t2/deftransforms :model/BranchRemapping
  {:entity_type mi/transform-keyword})
