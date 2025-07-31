(ns metabase-enterprise.reports.models.report
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log]
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

(defn validate-collection-move-permissions
  "Validates that the current user has write permissions for both old and new collections
   when moving a report. Uses the same permission pattern as check-allowed-to-change-collection.
   Throws 403 exception if permissions are insufficient."
  [old-collection-id new-collection-id]
  (when old-collection-id
    (collection/check-write-perms-for-collection old-collection-id))
  (when new-collection-id
    (collection/check-write-perms-for-collection new-collection-id))
  (when new-collection-id
    (api/check-400 (t2/exists? :model/Collection :id new-collection-id :archived false))))

(defn sync-report-cards-collection!
  "Updates all cards associated with a report to match the report's collection_id.
   Takes a report-id and new-collection-id as parameters.
   Uses bulk t2/update! operation for efficiency and operates within a transaction.
   Only updates cards with type = :in_report and matching report_document_id."
  [report-id new-collection-id]
  (t2/with-transaction [_conn]
    (let [updated-count (t2/update! :model/Card
                                    {:report_document_id report-id
                                     :type :in_report}
                                    {:collection_id new-collection-id})]
      (when (> updated-count 0)
        (log/debugf "Successfully updated %d cards to collection %s"
                    updated-count new-collection-id))
      updated-count)))

(t2/define-after-update :model/Report
  [{report-id :id new-collection-id :collection_id}]
  (sync-report-cards-collection! report-id new-collection-id))
