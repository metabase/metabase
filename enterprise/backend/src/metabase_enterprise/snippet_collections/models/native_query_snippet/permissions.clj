(ns metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  "EE implementation of NativeQuerySnippet permissions."
  (:require
   [metabase.api.common :as api]
   [metabase.native-query-snippets.core :as snippets]
   [metabase.native-query-snippets.schema :as snippets.schema]
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

(mu/defn- has-parent-collection-perms?
  "Whether the current user has `read-or-write` permissions on `snippet`'s parent collection. `snippet` must not be
  nil: a nonexistent Snippet must fail loudly here rather than silently fall back to root-collection permissions."
  [snippet       :- [:or
                     ::snippets.schema/native-query-snippet
                     ::snippets.schema/native-query-snippet.update]
   read-or-write :- [:enum :read :write]]
  (contains? (permitted-collection-ids [(:collection_id snippet)] read-or-write) (:collection_id snippet)))

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
   (has-parent-collection-perms? m :write)))

(defenterprise can-update?
  "Can the current User apply a map of `changes` to a `snippet`?"
  :feature :snippet-collections
  [snippet changes]
  (and
   (not (perms/sandboxed-user?))
   (snippets/has-any-native-permissions?)
   (has-parent-collection-perms? snippet :write)
   (or (not (contains? changes :collection_id))
       (has-parent-collection-perms? changes :write))))
