(ns metabase.sync.task.scan-field-values
  "Tasks that scan the FieldValues of one Database, Table or Field on request; as Quartz jobs each has one run at a time
  across the cluster."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.sync.db :as sync.db]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.task.util :as sync.task.util]
   [metabase.task.core :as task]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.field-values :as field-values]))

(set! *warn-on-reflection* true)

(defn- scan-database!
  "Update the FieldValues of the Database with `database-id`, if it exists."
  [database-id]
  (when (sync.db/database-exists? database-id)
    (sync.field-values/update-field-values! database-id)))

(defn- scan-table!
  "Update the FieldValues of the Fields of the Table with `table-id`, if it exists."
  [table-id]
  (some-> (sync.db/table table-id) sync.field-values/update-field-values-for-table!))

(defn- scan-field!
  "Update the FieldValues of the Field with `field-id`, if it exists, throwing when its values cannot be fetched."
  [field-id]
  (when-let [field (sync.db/field field-id)]
    (when (= ::field-values/fv-fetch-failed (field-values/create-or-update-full-field-values! field))
      (throw (ex-info "Could not fetch field values" {:field-id field-id})))))

(task/defjob ScanDatabaseFieldValues
  "Scan the FieldValues of one Database."
  {:saved-class "metabase.sync.task.scan_field_values.ScanDatabaseFieldValues"
   :concurrent? false}
  [job-context]
  (sync.task.util/run-for-target! scan-database! job-context))

(task/defjob ScanTableFieldValues
  "Scan the FieldValues of one Table."
  {:saved-class "metabase.sync.task.scan_field_values.ScanTableFieldValues"
   :concurrent? false}
  [job-context]
  (sync.task.util/run-for-target! scan-table! job-context))

(task/defjob ScanFieldValues
  "Scan the FieldValues of one Field."
  {:saved-class "metabase.sync.task.scan_field_values.ScanFieldValues"
   :concurrent? false}
  [job-context]
  (sync.task.util/run-for-target! scan-field! job-context))

(def ^:private database-job
  (sync.task.util/job ScanDatabaseFieldValues
                      "metabase.task.scan-database-field-values.job"
                      "Scan FieldValues of Database"))

(def ^:private table-job
  (sync.task.util/job ScanTableFieldValues
                      "metabase.task.scan-table-field-values.job"
                      "Scan FieldValues of Table"))

(def ^:private field-job
  (sync.task.util/job ScanFieldValues
                      "metabase.task.scan-field-values.job"
                      "Scan FieldValues of Field"))

(mu/defn schedule-database-field-values-scan!
  "Request a FieldValues scan of the Database with `database-id`, replacing a request for it that still waits when this
  node has a running scheduler."
  [database-id :- ::lib.schema.id/database]
  (sync.task.util/schedule! database-job database-id scan-database!))

(mu/defn schedule-table-field-values-scan!
  "Request a FieldValues scan of the Table with `table-id`, replacing a request for it that still waits when this node
  has a running scheduler."
  [table-id :- ::lib.schema.id/table]
  (sync.task.util/schedule! table-job table-id scan-table!))

(mu/defn schedule-field-values-scan!
  "Request a FieldValues scan of the Field with `field-id`, replacing a request for it that still waits when this node
  has a running scheduler."
  [field-id :- ::lib.schema.id/field]
  (sync.task.util/schedule! field-job field-id scan-field!))
