(ns metabase.transforms.core
  "API namespace for the `metabase.transforms` module."
  (:require
   [java-time.api :as t]
   [metabase.models.transforms.transform]
   [metabase.models.transforms.transform-job]
   [metabase.models.transforms.transform-run]
   [metabase.models.transforms.transform-run-cancelation]
   [metabase.models.transforms.transform-tag]
   [metabase.transforms-base.ordering]
   [metabase.transforms-base.util]
   [metabase.transforms.canceling]
   [metabase.transforms.crud]
   [metabase.transforms.execute]
   [metabase.transforms.feature-gating :as feature-gating]
   [metabase.transforms.jobs]
   [metabase.transforms.schedule]
   [metabase.transforms.settings]
   [metabase.transforms.util]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [metabase.transforms.settings
  transform-timeout]
 [metabase.transforms-base.util
  native-query-transform?
  python-transform?
  query-transform?
  transform-source-database
  transform-source-type
  transform-type]
 [metabase.transforms.util
  add-source-readable
  is-temp-transform-table?]
 [metabase.transforms.crud
  python-source-table-ref->table-id
  check-database-feature
  check-feature-enabled!
  extract-all-columns-from-query
  extract-incremental-filter-columns-from-query
  validate-incremental-column-type!
  validate-transform-query!
  get-transforms
  get-transform
  create-transform!
  update-transform!
  delete-transform!]
 [metabase.transforms.canceling
  cancel-run!]
 [metabase.transforms.execute
  execute!]
 [metabase.transforms-base.ordering
  transform-ordering
  get-transform-cycle]
 [metabase.transforms.jobs
  run-job!
  job-transforms]
 [metabase.transforms.schedule
  validate-cron-expression
  initialize-job!
  update-job!
  delete-job!
  existing-trigger]
 [metabase.models.transforms.transform
  update-transform-tags!]
 [metabase.models.transforms.transform-run
  timeout-run!
  paged-runs
  running-run-for-transform-id]
 [metabase.models.transforms.transform-run-cancelation
  mark-cancel-started-run!]
 [metabase.models.transforms.transform-job
  update-job-tags!]
 [metabase.models.transforms.transform-tag
  tag-name-exists?
  tag-name-exists-excluding?])

(defn transform-stats
  "Calculate successful transform runs over a window of the previous UTC day 00:00-23:59.
    Rolling stats are included under :transform-rolling (up to date totals for today)"
  []
  (let [today-utc      (t/offset-date-time (t/zone-offset "+00"))
        yesterday-utc  (t/minus today-utc (t/days 1))
        count-all-runs (fn [date]
                         (or (:cnt (t2/query-one {:select [[[:count :r.id] :cnt]]
                                                  :from   [[:transform_run :r]]
                                                  :where  [:and
                                                           [:= :r.status "succeeded"]
                                                           [:= [:cast :r.end_time :date] [:cast date :date]]]}))
                             0))
        advanced?      (feature-gating/python-transforms-enabled?)
        yesterday-runs (count-all-runs yesterday-utc)
        today-runs     (count-all-runs today-utc)]
    {:basic-runs                   (if advanced? 0 yesterday-runs)
     :advanced-runs                (if advanced? yesterday-runs 0)
     :transform-usage-date         (str (t/local-date yesterday-utc))
     :rolling-basic-runs           (if advanced? 0 today-runs)
     :rolling-advanced-runs        (if advanced? today-runs 0)
     :transform-rolling-usage-date (str (t/local-date today-utc))}))
