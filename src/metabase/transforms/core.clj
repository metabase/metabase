(ns metabase.transforms.core
  "API namespace for the `metabase.transforms` module."
  (:require
   [java-time.api :as t]
   [metabase.models.transforms.transform]
   [metabase.models.transforms.transform-run]
   [metabase.transforms.settings]
   [metabase.transforms.util]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [metabase.transforms.settings
  transform-timeout]
 [metabase.transforms.util
  native-query-transform?
  python-transform?
  query-transform?
  transform-source-database
  transform-source-type
  transform-type
  enabled-source-types
  is-temp-transform-table?]
 [metabase.models.transforms.transform-run
  timeout-run!]
 [metabase.models.transforms.transform
  update-transform-tags!]))

(defn transform-stats
  "Calculate successful transform runs over a window of the previous UTC day 00:00-23:59.
    Rolling stats are included under :transform-rolling (up to date totals for today)"
    []
    (let [today-utc     (t/offset-date-time (t/zone-offset "+00"))
          yesterday-utc (t/minus today-utc (t/days 1))
          count-runs    (fn [source-types date]
                          (or (:cnt (t2/query-one {:select [[[:count :r.id] :cnt]]
                                                   :from   [[:transform_run :r]]
                                                   :join   [[:transform :t] [:= :t.id :r.transform_id]]
                                                   :where  [:and
                                                            [:= :r.status "succeeded"]
                                                            [:in :t.source_type source-types]
                                                            [:= [:cast :r.end_time :date] [:cast date :date]]]}))
                              0))]
      {:transform-native-runs         (count-runs ["native" "mbql"] yesterday-utc)
       :transform-python-runs         (count-runs ["python"] yesterday-utc)
       :transform-usage-date          (str (t/local-date yesterday-utc))
       :transform-rolling-native-runs (count-runs ["native" "mbql"] today-utc)
       :transform-rolling-python-runs (count-runs ["python"] today-utc)
       :transform-rolling-usage-date  (str (t/local-date today-utc))}))
