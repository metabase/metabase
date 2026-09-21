(ns metabase.health-inspector.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.health-inspector.core :as hi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest api-test
  (t2/delete! :health_inspector_runs)
  (hi/save-report)
  (hi/save-report)
  (let [response (mt/user-http-request :crowberto :get 200 "/health-inspector")]
    (is (= [100 100 100 100] (map :health response)))
    (is (= ["test-check" "test-check" "validate-queries" "validate-queries"]
           (sort (map :check_name response))))))
