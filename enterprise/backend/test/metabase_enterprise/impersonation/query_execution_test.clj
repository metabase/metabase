(ns metabase-enterprise.impersonation.query-execution-test
  "Integration tests that verify `is_impersonated` is recorded on `:model/QueryExecution` rows when a query runs
  under an active connection-impersonation policy. Distinct from [[metabase-enterprise.impersonation.driver-test]]
  which tests role resolution; here we drive a full userland query through the QP and inspect the persisted row."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- latest-query-execution []
  (t2/select-one :model/QueryExecution {:order-by [[:id :desc]]}))

(deftest is-impersonated-true-when-impersonation-policy-active-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-model-cleanup [:model/QueryExecution]
      (binding [qp.util/*execute-async?* false]
        (impersonation.util-test/with-impersonations!
          {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
           :attributes     {"impersonation_attr" "impersonation_role"}}
          (qp/process-query (qp/userland-query (mt/mbql-query venues {:limit 1}) {:context :question}))
          (is (true? (:is_impersonated (latest-query-execution)))
              "QueryExecution row should record is_impersonated=true when the query ran under an impersonation policy"))))))

(deftest is-impersonated-false-when-no-policy-test
  (mt/with-model-cleanup [:model/QueryExecution]
    (binding [qp.util/*execute-async?* false]
      (mt/with-test-user :rasta
        (qp/process-query (qp/userland-query (mt/mbql-query venues {:limit 1}) {:context :question}))
        (is (false? (:is_impersonated (latest-query-execution))))))))
