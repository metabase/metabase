(ns metabase-enterprise.transforms.core
  "Enterprise module for transforms used for both tests and metering.

  Transforms are weird: they have different behavior on OSS vs EE. We need to test this, so we need tests
  in `enterprise/backend/test/metabase_enterprise/transforms/api_test.clj`.

  But we need a 'real' module, because all tests must belong to a module."
  (:require
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise transform-stats
  "Calculate successful transform runs over a window of the previous UTC day 00:00-23:59.
  Rolling stats are included under :transform-rolling (up to date totals for today)"
  :feature :none
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
        advanced?      (and (premium-features/has-feature? :transforms-basic)
                            (premium-features/has-feature? :transforms-python))
        yesterday-runs (count-all-runs yesterday-utc)
        today-runs     (count-all-runs today-utc)]
    {:transform-basic-runs                   (if advanced? 0 yesterday-runs)
     :transform-advanced-runs                (if advanced? yesterday-runs 0)
     :transform-usage-date         (str (t/local-date yesterday-utc))
     :transform-rolling-basic-runs           (if advanced? 0 today-runs)
     :transform-rolling-advanced-runs        (if advanced? today-runs 0)
     :transform-rolling-usage-date (str (t/local-date today-utc))}))
