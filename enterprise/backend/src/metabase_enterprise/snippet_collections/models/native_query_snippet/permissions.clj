(ns metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  "EE implementation of NativeQuerySnippet permissions."
  (:require
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.native-query-snippets.core :as snippets]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.malli :as mu]))

(defn- permitted-collection-ids
  "Those of `collection-ids`, nil standing for the snippets root, on which the current user has `read-or-write`
  permissions, answered together."
  [collection-ids read-or-write]
  (let [collection-ids (into [] (distinct) collection-ids)
        permissions    (perms/collection-permissions-for-user (api/current-user-info) collection-ids
                                                              {:root-namespace "snippets"})
        needed         (case read-or-write :read :read, :write :read-and-write)]
    (into #{} (filter #(perms/collection-permission-at-least? (get permissions %) needed)) collection-ids)))

(mu/defn- has-collection-perms?
  "Whether the current user has `read-or-write` permissions on the snippet Collection with `collection-id`, nil standing
  for the snippets root."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   read-or-write :- [:enum :read :write]]
  (contains? (permitted-collection-ids [collection-id] read-or-write) collection-id))

(defenterprise permitted-snippet-ids
  "The ids of the `snippets` the current User can read or write, by `read-or-write`: none for a sandboxed User or one
  without native query permissions for any database, asked once for them all, and otherwise those in a Collection
  they have the permission on."
  :feature :snippet-collections
  [snippets read-or-write]
  (if (and (not (perms/sandboxed-user?))
           (snippets/has-any-native-permissions?))
    (let [permitted (permitted-collection-ids (map :collection_id snippets) read-or-write)]
      (into #{} (comp (filter #(contains? permitted (:collection_id %))) (map :id)) snippets))
    #{}))

(defenterprise can-create?
  "Can the current User save a new Snippet with the values in `m`?"
  :feature :snippet-collections
  [_model m]
  (and
   (not (perms/sandboxed-user?))
   (snippets/has-any-native-permissions?)
   (has-collection-perms? (:collection_id m) :write)))

(defenterprise can-update?
  "Can the current User apply a map of `changes` to a `snippet`?"
  :feature :snippet-collections
  [snippet changes]
  (and
   (not (perms/sandboxed-user?))
   (snippets/has-any-native-permissions?)
   (has-collection-perms? (:collection_id snippet) :write)
   (or (not (contains? changes :collection_id))
       (has-collection-perms? (:collection_id changes) :write))))
