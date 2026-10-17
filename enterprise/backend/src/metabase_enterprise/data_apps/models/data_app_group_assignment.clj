(ns metabase-enterprise.data-apps.models.data-app-group-assignment
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataAppGroupAssignment [_model] :data_app_group_assignment)

(derive :model/DataAppGroupAssignment :metabase/model)

(defn- check-group-for-app-assignment
  [{group-id :permission_group_id :as assignment}]
  (let [group-tenant-flags (perms/group-tenant-flags #{group-id})]
    (api/check-404 (contains? group-tenant-flags group-id))
    (api/check-400 (and (not (get group-tenant-flags group-id))
                        (not= group-id (:id (perms/admin-group))))
                   (tru "Tenant groups and admins cannot be assigned to data apps.")))
  assignment)

(t2/define-before-insert :model/DataAppGroupAssignment
  [assignment]
  (check-group-for-app-assignment assignment))

(t2/define-before-update :model/DataAppGroupAssignment
  [assignment]
  (check-group-for-app-assignment assignment))

(defmethod mi/can-read? :model/DataAppGroupAssignment
  ([_instance] (mi/superuser?))
  ([_model _pk] (mi/superuser?)))

(defmethod mi/can-write? :model/DataAppGroupAssignment
  ([_instance] (mi/superuser?))
  ([_model _pk] (mi/superuser?)))

(defmethod mi/can-create? :model/DataAppGroupAssignment
  [_model _instance]
  (mi/superuser?))
