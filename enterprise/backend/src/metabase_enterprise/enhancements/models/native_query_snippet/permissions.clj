(ns metabase-enterprise.enhancements.models.native-query-snippet.permissions
  "EE implementation of NativeQuerySnippet permissions."
  (:require [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase.models.interface :as i]
            [metabase.models.native-query-snippet.permissions :as snippet.perms]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.metastore :as settings.metastore]
            [metabase.util.schema :as su]
            [pretty.core :refer [PrettyPrintable]]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private has-parent-collection-perms?
  [snippet       :- {:collection_id (s/maybe su/IntGreaterThanZero), s/Keyword s/Any}
   read-or-write :- (s/enum :read :write)]
  (i/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection "snippets" snippet read-or-write)))

(def ^:private ee-impl*
  (reify
    PrettyPrintable
    (pretty [_]
      `ee-impl*)

    snippet.perms/PermissionsImpl
    (can-read?* [_ snippet]
      (has-parent-collection-perms? snippet :read))

    (can-read?* [_ model id]
      (has-parent-collection-perms? (db/select-one [model :collection_id] :id id) :read))

    (can-write?* [_ snippet]
      (has-parent-collection-perms? snippet :write))

    (can-write?* [_ model id]
      (has-parent-collection-perms? (db/select-one [model :collection_id] :id id) :write))

    (can-create?* [_ model m]
      (has-parent-collection-perms? m :write))

    (can-update?* [_ snippet changes]
      (and (has-parent-collection-perms? snippet :write)
           (or (not (contains? changes :collection_id))
               (has-parent-collection-perms? changes :write))))))

(def ee-impl
  "EE implementation of NativeQuerySnippet permissions. Uses Collection permissions instead allowing anyone to view or
  edit all Snippets. (Only when a valid Enterprise Edition token is present. Otherwise, this forwards method
  invocations to the default impl)."
  (ee-strategy-impl/reify-ee-strategy-impl #'settings.metastore/enable-enhancements? ee-impl* snippet.perms/default-impl
    snippet.perms/PermissionsImpl))

(snippet.perms/set-impl! ee-impl)
