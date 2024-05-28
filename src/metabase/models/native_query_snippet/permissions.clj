(ns metabase.models.native-query-snippet.permissions
  "NativeQuerySnippets have different permissions implementations. In Metabase CE, anyone can read/edit/create all
  NativeQuerySnippets if they have native query perms for at least one database. EE has a more advanced implementation."
  (:require
   [metabase.api.common :as api]
   [metabase.models.data-permissions :as data-perms]
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defn has-any-native-permissions?
  "Checks whether the current user has native query permissions for any database."
  []
  (data-perms/user-has-any-perms-of-type? api/*current-user-id* :perms/create-queries))

(defenterprise can-read?
  "Can the current User read this `snippet`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  ([_]
   (has-any-native-permissions?))

  ([_ _]
   (has-any-native-permissions?)))

(defenterprise can-write?
  "Can the current User edit this `snippet`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  ([_]
   (has-any-native-permissions?))

  ([_ _]
   (has-any-native-permissions?)))

(defenterprise can-create?
  "Can the current User save a new Snippet with the values in `m`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  [_ _]
  (has-any-native-permissions?))

(defenterprise can-update?
  "Can the current User apply a map of `changes` to a `snippet`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  [_ _]
  (has-any-native-permissions?))
