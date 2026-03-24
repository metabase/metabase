(ns metabase.metabot.models.metabot-permissions
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotPermissions [_model] :metabot_permissions)

(doto :model/MetabotPermissions
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/MetabotPermissions
  {:perm_type  mi/transform-keyword
   :perm_value mi/transform-keyword})
