(ns metabase-enterprise.enhancements.models.native-query-snippet.permissions
  "EE implementation of NativeQuerySnippet permissions."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]))

(s/defn ^:private has-parent-collection-perms?
  [snippet       :- {:collection_id (s/maybe su/IntGreaterThanZero), s/Keyword s/Any}
   read-or-write :- (s/enum :read :write)]
  (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection "snippets" snippet read-or-write)))

(defenterprise can-read?
  "Can the current User read this `snippet`?"
  :feature :any
  ([snippet]
   (and
    (not (premium-features/sandboxed-user?))
    (snippet.perms/has-any-native-permissions?)
    (has-parent-collection-perms? snippet :read)))
  ([model id]
   (can-read? (t2/select-one [model :collection_id] :id id))))

(defenterprise can-write?
  "Can the current User edit this `snippet`?"
  :feature :any
  ([snippet]
   (and
    (not (premium-features/sandboxed-user?))
    (snippet.perms/has-any-native-permissions?)
    (has-parent-collection-perms? snippet :write)))
  ([model id]
   (can-write? (t2/select-one [model :collection_id] :id id))))

(defenterprise can-create?
  "Can the current User save a new Snippet with the values in `m`?"
  :feature :any
  [_model m]
  (and
   (not (premium-features/sandboxed-user?))
   (snippet.perms/has-any-native-permissions?)
   (has-parent-collection-perms? m :write)))

(defenterprise can-update?
  "Can the current User apply a map of `changes` to a `snippet`?"
  :feature :any
  [snippet changes]
  (and
   (not (premium-features/sandboxed-user?))
   (snippet.perms/has-any-native-permissions?)
   (has-parent-collection-perms? snippet :write)
   (or (not (contains? changes :collection_id))
       (has-parent-collection-perms? changes :write))))
