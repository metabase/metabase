(ns metabase-enterprise.snippet-collections.models.native-query-snippet.permissions
  "EE implementation of NativeQuerySnippet permissions."
  (:require
   [metabase-enterprise.snippet-collections.db :as snippet-collections.db]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.core :as snippets]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn- has-parent-collection-perms?
  [snippet       :- [:map [:collection_id [:maybe ms/PositiveInt]]]
   read-or-write :- [:enum :read :write]]
  (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection "snippets" snippet read-or-write)))

(defenterprise can-read?
  "Can the current User read this `snippet`?"
  :feature :snippet-collections
  ([snippet]
   (and
    (not (perms/sandboxed-user?))
    (snippets/has-any-native-permissions?)
    (has-parent-collection-perms? snippet :read)))
  ([_model id]
   (can-read? (snippet-collections.db/snippet-with-collection-id id))))

(defenterprise can-write?
  "Can the current User edit this `snippet`?"
  :feature :snippet-collections
  ([snippet]
   (and
    (not (perms/sandboxed-user?))
    (snippets/has-any-native-permissions?)
    (has-parent-collection-perms? snippet :write)
    (remote-sync/model-editable? :model/NativeQuerySnippet snippet)))
  ([_model id]
   (can-write? (snippet-collections.db/snippet-with-collection-id id))))

(defenterprise can-create?
  "Can the current User save a new Snippet with the values in `m`?"
  :feature :snippet-collections
  [_model m]
  (and
   (not (perms/sandboxed-user?))
   (snippets/has-any-native-permissions?)
   (has-parent-collection-perms? m :write)
   (remote-sync/model-editable? :model/NativeQuerySnippet m)))

(defenterprise can-update?
  "Can the current User apply a map of `changes` to a `snippet`?"
  :feature :snippet-collections
  [snippet changes]
  (and
   (not (perms/sandboxed-user?))
   (snippets/has-any-native-permissions?)
   (has-parent-collection-perms? snippet :write)
   (or (not (contains? changes :collection_id))
       (has-parent-collection-perms? changes :write))
   (remote-sync/model-editable? :model/NativeQuerySnippet snippet)))
