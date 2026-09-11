(ns metabase-enterprise.action-v2.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.actions :as action-v2.actions]
   [metabase-enterprise.action-v2.test-util :as action-v2.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

(def unsupported-dbs-msg #'action-v2.actions/unsupported-dbs-msg)

(deftest unsupported-dbs-msg-test
  (is (= "Data editing isn't supported on the target database." (unsupported-dbs-msg [{:id 1}] [{:id 1}])))
  (is (= "Data editing isn't supported on one of the target databases." (unsupported-dbs-msg [{:id 1} {:id 2}] [{:id 1}])))
  (is (= "Data editing isn't supported on the target databases." (unsupported-dbs-msg [{:id 1} {:id 2}] [{:id 1} {:id 2}])))
  (is (= "Data editing isn't supported on some of the target databases." (unsupported-dbs-msg [{:id 1} {:id 2} {:id 3}] [{:id 1} {:id 2}]))))

(deftest data-grid-audit-trail-test
  (testing "a data-grid write and its undo each record exactly one QueryExecution row"
    (mt/with-empty-h2-app-db!
      (mt/with-premium-features #{:table-data-editing}
        (action-v2.tu/with-test-tables! [table-id [{:id   [:int]
                                                    :name [:text]}
                                                   {:primary-key [:id]}]]
          (let [user-id (mt/user->id :crowberto)
                since   (mt/latest-query-execution-id)]
            (action-v2.tu/create-rows! table-id user-id 200 [{:id 1 :name "Snorkmaiden"}])
            (let [rows (mt/action-executions since)]
              (is (= 1 (count rows)))
              (testing "a data-grid action has no Action row to point at"
                (is (=? {:context     :action-execute
                         :native      false
                         :action_id   nil
                         :result_rows 1
                         :error       nil
                         :database_id (mt/id)}
                        (first rows)))))
            (testing "undo runs its nested actions under one row"
              (let [since (mt/latest-query-execution-id)]
                (mt/user-http-request user-id :post "/ee/action-v2/execute-bulk"
                                      {:action :data-editing/undo
                                       :scope  {:table-id table-id}
                                       :inputs [{}]})
                (is (= 1 (count (mt/action-executions since))))))))))))
