(ns metabase.testing-api.db
  "Application database queries for the testing API module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn permissions-group-id
  "The id of the PermissionsGroup named `group-name`, or nil."
  [group-name :- :string]
  (t2/select-one-pk :model/PermissionsGroup :name group-name))

(mu/defn group-membership-exists?
  "Whether the User with `user-id` is a member of the PermissionsGroup with `group-id`."
  [user-id  :- ::lib.schema.id/user
   group-id :- ms/PositiveInt]
  (t2/exists? :model/PermissionsGroupMembership :user_id user-id :group_id group-id))
