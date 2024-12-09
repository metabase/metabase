(ns metabase-enterprise.stats-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.stats :as ee-stats]
   [metabase.analytics.stats :as stats]))

(deftest ee-snowplow-features-test
  (testing "Every feature returned by `ee-snowplow-features-data` has a corresponding OSS fallback"
    (let [ee-features (map :name (ee-stats/ee-snowplow-features-data))
          oss-features (map :name (@#'stats/ee-snowplow-features-data'))]
      (is (= (sort ee-features) (sort oss-features))))))
