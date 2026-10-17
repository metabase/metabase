(ns metabase-enterprise.advanced-permissions.oss-hooks
  "Advanced-permissions implementations of the `defenterprise` hooks that OSS modules call."
  (:require
   [metabase-enterprise.advanced-permissions.common :as advanced-permissions.common]
   [metabase-enterprise.advanced-permissions.models.permissions.group-manager :as group-manager]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise current-user-manages-group?
  "Whether `*current-user*` is a manager of `group-or-id`."
  :feature :advanced-permissions
  [group-or-id]
  (advanced-permissions.common/current-user-is-manager-of-group? group-or-id))

(defenterprise set-group-memberships!
  "Set the group memberships of `user-or-id`, including whether the user manages each group."
  :feature :advanced-permissions
  [user-or-id new-user-group-memberships]
  (group-manager/set-user-group-memberships! user-or-id new-user-group-memberships))

(defenterprise maybe-add-advanced-permissions
  "Add the advanced-permissions map to `user`."
  :feature :advanced-permissions
  [user]
  (advanced-permissions.common/with-advanced-permissions user))
