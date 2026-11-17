(ns metabase.permissions.user
  (:require
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.published-tables :as published-tables]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise user->tenant-collection-and-descendant-ids
  "Returns descendant IDs for the user's tenant collection. Returns an empty vector in OSS since tenants are an EE feature."
  metabase-enterprise.tenants.models
  [_user-or-id]
  [])

(defn query-creation-capabilities
  "Returns a map with `:can-create-queries` and `:can-create-native-queries` for the given user,
   based on their create-queries permissions across all databases."
  [user-id]
  (let [best (data-perms/some-table-permission-for-user (data-perms/user-info user-id) :perms/create-queries)]
    {:can-create-queries        (boolean
                                 (or (data-perms/at-least-as-permissive? :perms/create-queries best :query-builder)
                                     (published-tables/user-has-any-published-table-permission?)))
     :can-create-native-queries (= best :query-builder-and-native)}))
