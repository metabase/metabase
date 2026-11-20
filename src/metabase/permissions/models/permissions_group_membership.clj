(ns metabase.permissions.models.permissions-group-membership
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.write :as perms.write]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.pipeline :as t2.pipeline]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PermissionsGroupMembership [_model] :permissions_group_membership)

(derive :model/PermissionsGroupMembership :metabase/model)

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-insert :model/PermissionsGroupMembership
  [{:keys [group_id] :as membership}]
  (perms.write/check-can-add-to-data-analyst-group group_id)
  membership)

(defn- unchecked-rows
  "The `rows` of an INSERT that no build of it in this transaction has checked yet, remembering them by identity, as
  MySQL and MariaDB build the INSERT of each row again to read its key."
  [rows]
  (if-let [state (mdb/transaction-state)]
    (let [checked (::checked-rows (swap! state update ::checked-rows #(or % (java.util.Collections/newSetFromMap
                                                                             (java.util.IdentityHashMap.)))))]
      (locking checked
        (into [] (filter #(.add ^java.util.Set checked %)) rows)))
    rows))

(methodical/defmethod t2.pipeline/build :around [:toucan.query-type/insert.*
                                                 :model/PermissionsGroupMembership
                                                 clojure.lang.IPersistentMap]
  "Checks the Users of every membership an INSERT writes against its group, in one read of them for the statement."
  [query-type model parsed-args resolved-query]
  (perms.write/check-members (unchecked-rows (or (:rows parsed-args) (:rows resolved-query))))
  (next-method query-type model parsed-args resolved-query))

(t2/define-after-insert :model/PermissionsGroupMembership
  [membership]
  (events/created! :model/PermissionsGroupMembership membership)
  (perms.write/sync-member-flags-on-insert! membership)
  membership)

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroupMembership :can_read]
  "Whether the current user can read each of `memberships`, which they can when they manage its group."
  [_model k memberships]
  (let [manages? (perms-group/manageable-group-id-fn)]
    (for [membership memberships]
      (when membership
        (vary-meta membership assoc k (manages? (:group_id membership)))))))

(methodical/defmethod t2/batched-hydrate [:model/PermissionsGroupMembership :can_write]
  "Whether the current user can write each of `memberships`, which they can when they manage its group."
  [_model k memberships]
  (let [manages? (perms-group/manageable-group-id-fn)]
    (for [membership memberships]
      (when membership
        (assoc membership k (manages? (:group_id membership)))))))

(defmethod mi/can-create? :model/PermissionsGroupMembership
  [_model {:keys [group_id]}]
  ((perms-group/manageable-group-id-fn) group_id))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/PermissionsGroupMembership
  [_model]
  {:create :event/group-membership-create
   :update :event/group-membership-update
   :delete :event/group-membership-delete})

(defmethod app-db-copy/spec :model/PermissionsGroupMembership [_model]
  {:skip? false})

(defmethod change-log/spec :model/PermissionsGroupMembership [_model]
  {:track [:user_id :group_id :is_group_manager]
   :skip  []})

(defmethod audit/spec :model/PermissionsGroupMembership [_model]
  {:track          [:id :user_id :group_id :is_group_manager]
   :track-redacted []
   :skip           []
   :topics         {:create :group-membership-create
                    :delete :group-membership-delete}})
