(ns metabase-enterprise.transforms.core
  "Enterprise module for transforms used for both tests and metering.

  Transforms are weird: they have different behavior on OSS vs EE. We need to test this, so we need tests
  in `enterprise/backend/test/metabase_enterprise/transforms/api_test.clj`.

  But we need a 'real' module, because all tests must belong to a module."
  (:require
   [java-time.api :as t]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise transform-metered-as
  "Return the meter bucket a new transform run of the given source-type counts toward,
   based on the instance's current premium features. Returns nil when the run is not metered."
  :feature :none
  [source-type]
  (let [hosted?   (premium-features/has-feature? :hosting)
        basic?    (premium-features/has-feature? :transforms-basic)
        writable? (premium-features/has-feature? :writable-connection)
        python?   (premium-features/has-feature? :transforms-python)]
    (case (keyword source-type)
      (:native :mbql) (cond
                        ;; These transforms are metered differently based on plan and addons status:
                        ;; - the advanced transforms addon adds the writable-connection feature, which
                        ;;   augments what they can do and meters them as advanced
                        (and basic? writable?) "transform-advanced"
                        ;; - hosted instances with basic transforms get these metered as basic
                        (and basic? hosted?)   "transform-basic"
                        ;; - self-hosted customers without the advanced add-on aren't metered for these at all
                        :else                  nil)
      :python         (when python? "transform-advanced")
      nil)))

(defenterprise transform-stats
  "Calculate successful transform runs over a window of the previous UTC day 00:00-23:59.
  Rolling stats are included under :transform-rolling (up to date totals for today).

  Runs are bucketed by the :metered_as column set at `start-run!` time."
  :feature :none
  []
  (let [today-utc     (t/offset-date-time (t/zone-offset "+00"))
        yesterday-utc (t/minus today-utc (t/days 1))
        counts-for    (fn [date]
                        (into {} (map (juxt :metered_as :cnt))
                              (t2/query {:select   [:r.metered_as [[:count :r.id] :cnt]]
                                         :from     [[:transform_run :r]]
                                         :where    [:and
                                                    [:= :r.status "succeeded"]
                                                    [:= [:cast :r.end_time :date] [:cast date :date]]]
                                         :group-by [:r.metered_as]})))
        yesterday     (counts-for yesterday-utc)
        today         (counts-for today-utc)]
    {:transform-basic-runs            (get yesterday "transform-basic" 0)
     :transform-advanced-runs         (get yesterday "transform-advanced" 0)
     :transform-usage-date            (str (t/local-date yesterday-utc))
     :transform-rolling-basic-runs    (get today "transform-basic" 0)
     :transform-rolling-advanced-runs (get today "transform-advanced" 0)
     :transform-rolling-usage-date    (str (t/local-date today-utc))}))
