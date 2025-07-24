(ns metabase-enterprise.reports.models.report
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defmethod mi/can-read? :model/Report
  ([instance]
   (mi/current-user-has-full-permissions? (perms/perms-objects-set-for-parent-collection instance :read)))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Report :id pk))))

(defmethod mi/can-write? :model/Report
  ([_instance] api/*is-superuser?*)
  ([_ _pk] api/*is-superuser?*))

(methodical/defmethod t2/table-name :model/Report [_model] :report_document)

(doto :model/Report
  (derive :metabase/model)
  (derive :hook/timestamped?))
