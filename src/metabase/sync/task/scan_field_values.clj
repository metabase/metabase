(ns metabase.sync.task.scan-field-values
  "Task that scans the FieldValues of Tables and Fields on request, one scan at a time across the cluster."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-schema.models.field-values :as field-values]))

(set! *warn-on-reflection* true)

(def ^:private job-key (jobs/key "metabase.task.scan-field-values.job"))

(defn- scan-table!
  "Update the FieldValues of the Fields of the Table with `table-id`, if it exists."
  [table-id]
  (some-> (sync.db/table table-id) sync.field-values/update-field-values-for-table!))

(defn- scan-field!
  "Update the FieldValues of the Field with `field-id`, if it exists."
  [field-id]
  (when-let [field (sync.db/field field-id)]
    (when (= ::field-values/fv-fetch-failed (field-values/create-or-update-full-field-values! field))
      (log/warnf "Failed to scan field values of Field %d" field-id))))

(def ^:private target->scan!
  {"table" scan-table!
   "field" scan-field!})

(task/defjob ScanFieldValues
  "Scan the FieldValues of one Table or one Field."
  {:saved-class "metabase.sync.task.scan_field_values.ScanFieldValues"
   :concurrent? false}
  [job-context]
  (let [{:strs [target id]} (qc/from-job-data job-context)]
    ((target->scan! target) id)))

(def ^:private job
  (jobs/build
   (jobs/with-description "Scan FieldValues of one Table or Field")
   (jobs/of-type ScanFieldValues)
   (jobs/with-identity job-key)
   (jobs/store-durably)))

(defn- trigger [target id]
  (triggers/build
   (triggers/with-description (format "Scan FieldValues of %s %d" target id))
   (triggers/with-identity (triggers/key (format "metabase.task.scan-field-values.trigger.%s.%d" target id)))
   (triggers/using-job-data {"target" target, "id" id})
   (triggers/for-job job-key)
   (triggers/start-now)))

(defn- schedule-scan! [target id]
  (or (task/schedule-once! (trigger target id))
      (quick-task/submit-task! #((target->scan! target) id))))

(mu/defn schedule-table-field-values-scan!
  "Queue one FieldValues scan of the Table with `table-id`, unless one is already waiting."
  [table-id :- ::lib.schema.id/table]
  (schedule-scan! "table" table-id))

(mu/defn schedule-field-values-scan!
  "Queue one FieldValues scan of the Field with `field-id`, unless one is already waiting."
  [field-id :- ::lib.schema.id/field]
  (schedule-scan! "field" field-id))

(defmethod task/init! ::ScanFieldValues
  [_]
  (task/add-job! job))
