(ns metabase.task.delete-inactive-tables
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time :as t]
   [metabase.config :as config]
   [metabase.models.task-history :as task-history]
   [metabase.task :as task]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private inactive-table-max-days
  "The maximum number of days to keep inactive tables around for."
  (or (config/config-int :inactive-table-max-days) 180))

(def ^:private job-key     "metabase.task.delete-inactive-tables.job")
(def ^:private trigger-key "metabase.task.delete-inactive-tables.trigger")

(defn- delete-inactive-tables!
  []
  (log/debug (trs "Cleaning up Inactive Tables older than {0} days" inactive-table-max-days))
  (task-history/with-task-history {:task "delete-inactive-tables"}
    (t2/delete! :model/Table
                :active     false
                :updated_at [:< (t/minus (t/zoned-date-time) (t/days inactive-table-max-days))]
                ;; do not delete tables that have active cards associated with them (#35615)
                :id         [:not-in {:select-distinct [:table_id]
                                      :from            [:report_card]
                                      :where           [:= :archived false]}])))

(jobs/defjob
  ^{:doc "Delete inactive Tables."}
  DeleteInactiveTables [_]
  (delete-inactive-tables!))

(defmethod task/init! ::DeleteInactiveTables [_]
  (let [job     (jobs/build
                 (jobs/of-type DeleteInactiveTables)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; run every day at 1 AM
                   (cron/cron-schedule "0 30 1 * * ? *")))]
    (task/schedule-task! job trigger)))
