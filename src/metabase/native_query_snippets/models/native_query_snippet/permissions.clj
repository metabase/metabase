(ns metabase.native-query-snippets.models.native-query-snippet.permissions
  "NativeQuerySnippets have different permissions implementations. In Metabase CE, anyone can read/edit/create all
  NativeQuerySnippets if they have native query perms for at least one database. EE has a more advanced implementation."
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [toucan2.core :as t2]))

(defn has-any-native-permissions?
  "Checks whether the current user has native query permissions for any database."
  []
  (perms/user-has-any-perms-of-type? api/*current-user-id* :perms/create-queries))

(defenterprise can-read?
  "Can the current User read this `snippet`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  ([snippet]
   (and (remote-sync/workspace-accessible? snippet)
        (has-any-native-permissions?)))
  ([model id]
   (can-read? (t2/select-one model :id id))))

(defenterprise can-write?
  "Can the current User edit this `snippet`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  ([snippet]
   (and (remote-sync/workspace-accessible? snippet)
        (has-any-native-permissions?)))
  ([model id]
   (can-write? (t2/select-one model :id id))))

(defenterprise can-create?
  "Can the current User save a new Snippet with the values in `m`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  [_model m]
  (and (remote-sync/workspace-accessible? m)
       (has-any-native-permissions?)))

(defenterprise can-update?
  "Can the current User apply a map of `changes` to a `snippet`?"
  metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  [snippet _changes]
  (and (remote-sync/workspace-accessible? snippet)
       (has-any-native-permissions?)))
