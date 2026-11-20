(ns metabase.permissions.write
  "The writes of collection and application permission rows, the update of the Collection permissions graph, and the
  revision rows of the permission graphs."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.config.core :as config]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.models.collection-permission-graph-revision :as c-perm-revision]
   [metabase.permissions.models.collection.graph :as collection.graph]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.path :as permissions.path]
   [metabase.permissions.util :as perms.u]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Revisions -------------------------------------------------

(defn save-perms-revision!
  "Save changes made to permission graph for logging/auditing purposes.
  This doesn't do anything if `*current-user-id*` is unset (e.g. for testing or REPL usage).
  *  `model`   -- revision model, should be one of
                  [PermissionsRevision, CollectionPermissionGraphRevision, ApplicationPermissionsRevision]
  *  `before`  -- the graph before the changes
  *  `changes` -- set of changes applied in this revision."
  [model current-revision before changes]
  (when api/*current-user-id*
    ;; manually specify ID here so if one was somehow inserted in the meantime in the fraction of a second since we
    ;; called `check-revision-numbers` the PK constraint will fail and the transaction will abort
    (let [revision {:id      (inc current-revision)
                    :before  before
                    :after   changes
                    :user_id api/*current-user-id*}]
      (case model
        :model/PermissionsRevision            (permissions.db/insert-permissions-revision-returning-instance! revision)
        :model/ApplicationPermissionsRevision (permissions.db/insert-application-permissions-revision-returning-instance! revision)))))

(mu/defn increment-implicit-perms-revision!
  "Save changes made to permissions that are NOT due to an explicit update to the permissions graph, but rather due to
  adding or removing entities from the system. For example, when adding a collection, we should increment the current
  revision number.

  Note that in these cases, `before` and `after` will not be provided."
  [model :- [:enum :model/CollectionPermissionGraphRevision]
   remark :- :string]
  (when api/*current-user-id*
    (case model
      :model/CollectionPermissionGraphRevision
      (permissions.db/insert-collection-permission-graph-revision!
       {:id      (inc (c-perm-revision/latest-id))
        :before  {}
        :after   {}
        :user_id api/*current-user-id*
        :remark  remark}))))

;;; -------------------------------------------- Permission rows ---------------------------------------------

(mu/defn- delete-related-permissions!
  "Delete all 'related' permissions for `group-or-id` (i.e., perms that grant you full or partial access to `path`).
  This includes *both* ancestor and descendant paths. For example:

  Suppose we asked this functions to delete related permissions for `/db/1/schema/PUBLIC/`. Depending on the
  permissions the group has, it could end up doing something like:

    *  deleting `/db/1/` permissions (because the ancestor perms implicitly grant you full perms for `schema/PUBLIC`)
    *  deleting perms for `/db/1/schema/PUBLIC/table/2/` (because Table 2 is a descendant of `schema/PUBLIC`)

  In short, it will delete any permissions that contain `/db/1/schema/` as a prefix, or that themeselves are prefixes
  for `/db/1/schema/`."
  [group-or-id :- permissions.path/GroupOrID path :- perms.u/PathSchema]
  (let [group-id (u/the-id group-or-id)
        paths    (conj (perms.u/->v2-path path) path)]
    (when-let [revoked (permissions.db/related-permission-objects group-id path paths)]
      (log/debug (u/format-color 'red "Revoking permissions for group %d: %s" group-id revoked))
      (permissions.db/delete-related-permissions! group-id path paths))))

(defn grant-permissions!
  "Grant the permissions `path` gives to `group-or-id`, returning nil."
  [group-or-id path]
  (try
    (permissions.db/insert-permissions! (map (fn [path-object]
                                               {:group_id (u/the-id group-or-id) :object path-object})
                                             (distinct (conj (perms.u/->v2-path path) path))))
    nil
    ;; on some occasions through weirdness we might accidentally try to insert a key that's already been inserted
    (catch Throwable e
      (log/error (u/format-color 'red "Failed to grant permissions: %s" (ex-message e)))
      ;; if we're running tests, we're doing something wrong here if duplicate permissions are getting assigned,
      ;; mostly likely because tests aren't properly cleaning up after themselves, and possibly causing other tests
      ;; to pass when they shouldn't. Don't allow this during tests
      (when config/is-test?
        (throw e)))))

(defn revoke-application-permissions!
  "Remove all permissions entries for a Group to access a Application permissions"
  [group-or-id perm-type]
  (delete-related-permissions! group-or-id (permissions.path/application-perms-path perm-type)))

(defn grant-application-permissions!
  "Grant full permissions for a group to access a Application permissions."
  [group-or-id perm-type]
  (when (and (perms-group/is-tenant-group? group-or-id)
             (not= perm-type :subscription))
    (throw (ex-info (tru "Cannot grant application permission to a tenant group.") {})))
  (grant-permissions! group-or-id (permissions.path/application-perms-path perm-type)))

;; TODO: We really have to figure out a better solution to these circular dependencies than this
(defn- is-personal-collection-or-descendant-of-one? [collection]
  ((requiring-resolve 'metabase.collections.models.collection/is-personal-collection-or-descendant-of-one?) collection))

(defn- is-trash-or-descendant? [collection]
  ((requiring-resolve 'metabase.collections.models.collection/is-trash-or-descendant?) collection))

(defn- shared-tenant-collection?
  [collection]
  ((requiring-resolve 'metabase.collections.models.collection/shared-tenant-collection?) collection))

(defn- ^:private collection-or-id->collection
  [collection-or-id]
  (if (map? collection-or-id)
    collection-or-id
    (permissions.db/collection (u/the-id collection-or-id))))

(mu/defn- check-is-modifiable-collection
  "Check whether `collection-or-id` refers to a collection that can have permissions modified. Personal collections, the
  Trash, and descendants of those can't have their permissions modified."
  [collection-or-id :- permissions.path/CollectionOrID]
  ;; skip the whole thing for the root collection, we know it's not a personal collection, trash, or descendant of one
  ;; of them.
  (when-not (:metabase.collections.models.collection.root/is-root? collection-or-id)
    (let [collection (collection-or-id->collection collection-or-id)]
      ;; Check whether the collection is the Trash collection or a descendant thereof; if so, throw an Exception. This
      ;; is done because you can't modify the permissions of things in the Trash, you need to untrash them first.
      (when (is-trash-or-descendant? collection)
        (throw (ex-info (tru "You cannot edit permissions for the Trash collection or its descendants.") {})))
      ;; Check whether the collection is a personal collection or a descendant thereof; if so, throw an Exception.
      ;; This is done because we *should* never be editing granting/etc. permissions for *Personal* Collections to
      ;; entire Groups! Their owner will get implicit permissions automatically, and of course admins will be able to
      ;; see them,but a whole group should never be given some sort of access.
      (when (is-personal-collection-or-descendant-of-one? collection)
        (throw (ex-info (tru "You cannot edit permissions for a Personal Collection or its descendants.") {}))))))

(mu/defn revoke-collection-permissions!
  "Revoke all access for `group-or-id` to a Collection."
  [group-or-id :- permissions.path/GroupOrID collection-or-id :- permissions.path/CollectionOrID]
  (check-is-modifiable-collection collection-or-id)
  (delete-related-permissions! group-or-id (permissions.path/collection-readwrite-path collection-or-id)))

(mu/defn grant-collection-readwrite-permissions!
  "Grant full access to a Collection, which means a user can view all Cards in the Collection and add/remove Cards."
  [group-or-id :- permissions.path/GroupOrID collection-or-id :- permissions.path/CollectionOrID]
  (check-is-modifiable-collection collection-or-id)
  (when (perms-group/is-tenant-group? group-or-id)
    (throw (ex-info (tru "Tenant groups cannot have write access to any collections.") {})))
  (grant-permissions! (u/the-id group-or-id) (permissions.path/collection-readwrite-path collection-or-id)))

(mu/defn grant-collection-read-permissions!
  "Grant read access to a Collection, which means a user can view all Cards in the Collection."
  [group-or-id :- permissions.path/GroupOrID collection-or-id :- permissions.path/CollectionOrID]
  (check-is-modifiable-collection collection-or-id)
  (let [collection (collection-or-id->collection collection-or-id)]
    (when (perms-group/is-tenant-group? group-or-id)
      (when-not (or (shared-tenant-collection? collection)
                    ;; Tenant groups access data apps through read grants on its resource collection.
                    (and (pos-int? (:id collection))
                         (data-perms/collection-owned-by-data-app? (:id collection))))
        (throw (ex-info (tru "Tenant groups cannot receive access to non-tenant collections.") {})))))
  (grant-permissions! (u/the-id group-or-id) (permissions.path/collection-read-path collection-or-id)))

;;; -------------------------------------- Collection permissions graph --------------------------------------

;; PostgreSQL limits prepared statements to 65,535 bind parameters.
(def ^:private max-in-clause-size 20000)

(defn- chunked
  "Applies `f` (a function from a set of IDs to a set of IDs) to `ids`, chunking large ID sets to avoid exceeding the
  bind parameter limit."
  [ids f]
  (if (<= (count ids) max-in-clause-size)
    (f (set ids))
    (into #{} (mapcat #(f (set %))) (partition-all max-in-clause-size ids))))

(mu/defn- update-collection-permissions!
  "Update the permissions for group ID with `group-id` on collection with ID
  `collection-id` in the optional `collection-namespace` to `new-collection-perms`."
  [collection-namespace :- [:maybe ms/KeywordOrString]
   group-id :- ms/PositiveInt
   collection-id :- [:or [:= :root] ms/PositiveInt]
   new-collection-perms :- collection.graph/CollectionPermissions]
  (let [collection-id (if (= collection-id :root)
                        (assoc collection.root/root-collection :namespace collection-namespace)
                        collection-id)]
    ;; remove whatever entry is already there (if any) and add a new entry if applicable
    (revoke-collection-permissions! group-id collection-id)
    (case new-collection-perms
      :write (grant-collection-readwrite-permissions! group-id collection-id)
      :read (grant-collection-read-permissions! group-id collection-id)
      :none nil)))

(mu/defn- update-group-permissions!
  [collection-namespace :- [:maybe ms/KeywordOrString]
   group-id :- ms/PositiveInt
   new-group-perms :- collection.graph/GroupPermissionsGraph]
  (doseq [[collection-id new-perms] new-group-perms]
    (update-collection-permissions! collection-namespace group-id collection-id new-perms)))

(defenterprise update-audit-collection-permissions!
  "OSS implementation of `audit-db/update-audit-collection-permissions!`, which is an enterprise feature, so does nothing in the OSS
  version. Returns the changes map unchanged."
  metabase-enterprise.audit-app.permissions [_ changes] changes)

(defn create-perms-revision!
  "Increments the current revision number and writes it to the database. This lets us track the permissions graph
  revision number, which is used for consistency checks when updating the graph."
  [current-revision-number]
  (when api/*current-user-id*
    (permissions.db/insert-collection-permission-graph-revision-returning-instance!
     {:id      (inc current-revision-number)
      :user_id api/*current-user-id*
      :before  ""
      :after   ""})))

(defn fill-revision-details!
  "Updates perm revision, this is used for logging/auditing purposes, and can be quite expensive, so in practice is
   called after the revision number is updated."
  [revision-id before changes]
  (future (permissions.db/update-collection-graph-revision! revision-id {:before before :after changes})))

(defn- personal-collection-ids
  "Return a set of IDs from `collection-ids` that are personal Collections or descendants of personal Collections.
  These should never appear in permission graphs or be editable via the graph API."
  [collection-ids]
  (when-let [ids (seq (disj collection-ids :root))]
    (chunked ids permissions.db/personal-or-descendant-collection-ids)))

(defn- remove-personal-collections-from-graph
  "Remove any personal collection IDs from the graph. Personal collections cannot be edited via the graph API."
  [graph collection-ids]
  (let [personal-ids (personal-collection-ids collection-ids)]
    (cond-> graph
      (seq personal-ids) (update :groups update-vals #(apply dissoc % personal-ids)))))

(defn- remove-collections-from-other-namespaces
  "Remove any collection IDs from the graph that belong to another namespace from the graph being updated."
  [graph collection-ids namespace]
  (let [ids          (disj collection-ids :root)
        other-ns-ids (when (seq ids)
                       (chunked ids #(permissions.db/collection-ids-in-other-namespace % namespace)))]
    (cond-> graph
      (seq other-ns-ids) (update :groups update-vals #(apply dissoc % other-ns-ids)))))

(defn- check-data-analyst-library-permissions
  "Check that we're not modifying library collection permissions for the Data Analysts group.
   Data Analysts always have full read-write access to library collections."
  [changes]
  (let [data-analyst-group-id (u/the-id (perms-group/data-analyst))
        library-collection-ids (permissions.db/library-collection-ids)]
    (when-let [group-changes (get changes data-analyst-group-id)]
      (let [changed-collection-ids (set (keys group-changes))
            library-changes (set/intersection changed-collection-ids library-collection-ids)]
        (when (seq library-changes)
          (throw (ex-info (str "You cannot modify library collection permissions for the '"
                               (:name (perms-group/data-analyst))
                               "' group.")
                          {:status-code 400})))))))

(def ^:private admin-only-write-namespaces
  "The Collection namespaces only admins can write, so no group can be granted write on them."
  #{"data-actions" "data-apps"})

(defn- check-no-admin-only-namespace-write
  "Throws a 400 when `changes` to the Collections of `collection-namespace` grant write in an admin-only namespace."
  [collection-namespace changes]
  (when (and (contains? admin-only-write-namespaces (some-> collection-namespace name))
             (some #{:write} (mapcat vals (vals changes))))
    (throw (ex-info (tru "You cannot grant write permissions on collections only admins can write.")
                    {:status-code 400}))))

(mu/defn update-graph!
  "Update the Collections permissions graph for Collections of `collection-namespace` (default `nil`, the 'default'
  namespace). This works just like [[metabase.models.permission/update-data-perms-graph!]], but for Collections;
  refer to that function's extensive documentation to get a sense for how this works.

  **Automatic Filtering:**
  The following collection IDs are automatically filtered from `new-graph` before processing:
  - Personal collections and their descendants (cannot be edited via the graph API)
  - Collections belonging to namespaces other than `collection-namespace` (prevents cross-namespace edits)

  This filtering ensures that:
  1. Attempts to modify personal collection permissions are silently ignored
  2. Namespace isolation is maintained
  3. Only valid, permissioned collections are processed

  **Permissions Values:**
  Each group/collection pair in the graph can have one of three values:
  - `:write` - Full read and write access
  - `:read` - Read-only access
  - `:none` - No access (revokes existing permissions)

  **Return Value:**
  - Returns `nil` if there are no changes to apply
  - Returns a `Future` if changes were made (used to populate revision details asynchronously)
  - To run synchronously, deref the non-nil return value: `@(update-graph! ...)`

  **Revision Tracking:**
  All changes are tracked in `CollectionPermissionGraphRevision` for auditing purposes. The revision number
  is checked to prevent concurrent modification conflicts (unless `force?` is true)."
  ([new-graph :- collection.graph/PermissionsGraph]
   (update-graph! nil new-graph false))

  ([collection-namespace :- [:maybe ms/KeywordOrString]
    new-graph :- collection.graph/PermissionsGraph
    force? :- [:maybe boolean?]]
   (let [new-group-ids (-> new-graph :groups keys set)
         new-collection-ids (->> new-graph :groups vals (mapcat keys) set)
         filtered-new-graph (-> (remove-personal-collections-from-graph new-graph new-collection-ids)
                                (remove-collections-from-other-namespaces new-collection-ids collection-namespace))
         old-graph (collection.graph/graph collection-namespace new-collection-ids new-group-ids)
         ;; the new graph requires permissions to be included explicitly -- it's a fragment rather than a sparse graph
         ;; once we've removed illegal collections like personal collections or collections from other namespaces
         [diff-old changes] (data/diff (:groups old-graph) (->> (:groups filtered-new-graph)
                                                                (filter (comp seq second))
                                                                (into {})))]
     (check-data-analyst-library-permissions changes)
     (check-no-admin-only-namespace-write collection-namespace changes)
     (when-not force? (perms.u/check-revision-numbers old-graph filtered-new-graph))
     (when (seq changes)
       (let [revision-id (t2/with-transaction [_conn]
                           (doseq [[group-id changes] changes]
                             (let [changes (update-audit-collection-permissions! group-id changes)]
                               (update-group-permissions! collection-namespace group-id changes)))
                           (:id (create-perms-revision! (:revision old-graph))))]
         ;; The graph is updated infrequently, but `diff-old` and `old-graph` can get huge on larger instances.
         (perms.u/log-permissions-changes diff-old changes)
         (fill-revision-details! revision-id (assoc old-graph :namespace collection-namespace) changes))))))
