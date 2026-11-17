(ns metabase-enterprise.metabot.models.metabot-limits-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.schema :as metabot-ee.schema]
   [metabase.util.malli.registry :as mr]))

(deftest group-limit-max-usage-is-non-negative-test
  (is (not (mr/validate ::metabot-ee.schema/metabot-group-limit.update {:max_usage -1})))
  (doseq [max-usage [nil 0 5]]
    (is (mr/validate ::metabot-ee.schema/metabot-group-limit.update {:max_usage max-usage}))))

(deftest instance-limit-max-usage-is-non-negative-test
  (is (not (mr/validate ::metabot-ee.schema/metabot-instance-limit.update {:max_usage -1})))
  (doseq [max-usage [nil 0 5]]
    (is (mr/validate ::metabot-ee.schema/metabot-instance-limit.update {:max_usage max-usage}))))
