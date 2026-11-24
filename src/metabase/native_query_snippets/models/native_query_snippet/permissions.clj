(ns metabase.native-query-snippets.models.native-query-snippet.permissions
  "NativeQuerySnippets have different permissions implementations. In Metabase CE, anyone can read/edit/create all
  NativeQuerySnippets if they have native query perms for at least one database. EE has a more advanced implementation."
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]))

(defn has-any-native-permissions?
  "Checks whether the current user has native query permissions for any database."
  []
  (perms/user-has-highest-permission-anywhere? (perms/user-info api/*current-user-id*) :perms/create-queries))

(defenterprise permitted-snippet-ids
  "The ids of the `snippets` the current User can read or write, by `read-or-write`: all of them with native query
  permissions for at least one database, asked once for them all."
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  [snippets _read-or-write]
  (if (has-any-native-permissions?)
    (into #{} (map :id) snippets)
    #{}))

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
