(ns metabase-enterprise.transforms.core
  "API namespace for the `metabase-enterprise.transform` module."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.transforms.models.transform-run]
   [metabase-enterprise.transforms.settings]
   [metabase-enterprise.transforms.util]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [metabase-enterprise.transforms.settings
  transform-timeout]
 [metabase-enterprise.transforms.util
  native-query-transform?
  python-transform?
  query-transform?]
 [metabase-enterprise.transforms.models.transform-run
  timeout-run!])

(defenterprise transform-stats
  "Calculate successful transform runs over a window of the previous UTC day 00:00-23:59"
  :feature :none
  []
  (let [yesterday-utc (-> (t/offset-date-time (t/zone-offset "+00"))
                          (t/minus (t/days 1)))
        count-runs    (fn [source-types]
                        (or (:cnt (t2/query-one {:select [[[:count :r.id] :cnt]]
                                                 :from   [[:transform_run :r]]
                                                 :join   [[:transform :t] [:= :t.id :r.transform_id]]
                                                 :where  [:and
                                                          [:= :r.status "succeeded"]
                                                          [:in :t.source_type source-types]
                                                          [:= [:cast :r.end_time :date] [:cast yesterday-utc :date]]]}))
                            0))]
    {:transform-native-runs (count-runs ["native" "mbql"])
     :transform-python-runs (count-runs ["python"])
     :transform-usage-date  (str (t/local-date yesterday-utc))}))
