(ns metabase.health-inspector.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.health-inspector.core :as hi]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest api-test
  ;; A test-scoped registry, so the endpoint's rows are this test's own. The global one holds whatever the
  ;; loaded namespaces registered, which varies with the instance: one configured for pgvector, for instance,
  ;; adds a store-readiness row to every report.
  (with-redefs [hi/checks (atom {:test-check (constantly {:health 100 :message "test check"})})]
    (t2/delete! :health_inspector_runs)
    (hi/save-report)
    (hi/save-report)
    (let [response (mt/user-http-request :crowberto :get 200 "/health-inspector")]
      (is (= [100 100] (map :health response)))
      (is (= ["test-check" "test-check"]
             (sort (map :check_name response)))))))
