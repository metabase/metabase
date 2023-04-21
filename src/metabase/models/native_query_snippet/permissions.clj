(ns metabase.models.native-query-snippet.permissions
  "NativeQuerySnippets have different permissions implementations. In Metabase CE, anyone can read/edit/create all
  NativeQuerySnippets if they have native query perms for at least one database. EE has a more advanced implementation."
  (:require
   [metabase.api.common :as api]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :refer [defenterprise]]))

(defn has-any-native-permissions?
  "Checks whether the current user has native query permissions for any database."
  []
  (perms/set-has-any-native-query-permissions? @api/*current-user-permissions-set*))

(defenterprise can-read?
  "Can the current User read this `snippet`?"
  metabase-enterprise.enhancements.models.native-query-snippet.permissions
  ([_]
   (has-any-native-permissions?))

  ([_ _]
   (has-any-native-permissions?)))

(defenterprise can-write?
  "Can the current User edit this `snippet`?"
  metabase-enterprise.enhancements.models.native-query-snippet.permissions
  ([_]
   (has-any-native-permissions?))

  ([_ _]
   (has-any-native-permissions?)))

(defenterprise can-create?
  "Can the current User save a new Snippet with the values in `m`?"
  metabase-enterprise.enhancements.models.native-query-snippet.permissions
  [_ _]
  (has-any-native-permissions?))

(defenterprise can-update?
  "Can the current User apply a map of `changes` to a `snippet`?"
  metabase-enterprise.enhancements.models.native-query-snippet.permissions
  [_ _]
  (has-any-native-permissions?))
