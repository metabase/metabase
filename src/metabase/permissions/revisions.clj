(ns metabase.permissions.revisions
  "Saving the revisions that log changes to the permission graphs."
  (:require
   [metabase.api.common :as api]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.models.collection-permission-graph-revision :as collection-permission-graph-revision]
   [metabase.util.malli :as mu]))

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
       {:id      (inc (collection-permission-graph-revision/latest-id))
        :before  {}
        :after   {}
        :user_id api/*current-user-id*
        :remark  remark}))))
