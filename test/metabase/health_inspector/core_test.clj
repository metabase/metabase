(ns metabase.health-inspector.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.health-inspector.core :as hi]
   [toucan2.core :as t2]))

(defn- test-check []
  {:health 100
   :message "test check"})

(hi/register-check! :test-check test-check)

(deftest report-test
  (binding [hi/*delay* 0]
    (let [report (hi/report)]
      (testing "test check works"
        (is (= {:health 100 :message "test check"}
               (:test-check report))))
      (testing "validate-queries works"
        (is (= 100 (-> report :validate-queries :health)))))))

(deftest report-db-test
  (binding [hi/*delay* 0]
    (t2/delete! :health_inspector_runs)
    (hi/save-report)
    (hi/save-report)
    (let [runs (group-by :check_name (hi/list-runs))]
      (is (= [100 100] (map :health (runs "test-check"))))
      (is (= ["test check" "test check"] (map :message (runs "test-check"))))
      (is (= [100 100] (map :health (runs "validate-queries")))))))
