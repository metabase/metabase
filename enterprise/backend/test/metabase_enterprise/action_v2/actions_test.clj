(ns metabase-enterprise.action-v2.actions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.actions :as action-v2.actions]
   [metabase-enterprise.action-v2.test-util :as action-v2.tu]
   [metabase.actions.core :as actions]
   [metabase.lib-be.core :as lib-be]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

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

(defn- perform-rows!
  [action-kw table-ids n]
  (lib-be/with-metadata-provider-cache
    (mt/with-current-user (mt/user->id :crowberto)
      (actions/perform-action-v2! action-kw {:table-id (first table-ids)}
                                  (vec (for [i (range n)]
                                         {:table-id (nth table-ids (mod i (count table-ids)))
                                          :row      {"name" (str "row " i) "song" "song"}}))))))

(defn- statements!
  [action-kw table-ids n]
  (t2/with-call-count [call-count]
    (perform-rows! action-kw table-ids n)
    (call-count)))

(deftest bulk-row-actions-read-table-databases-once-test
  (mt/with-premium-features #{:table-data-editing}
    (action-v2.tu/with-test-tables! [table-a action-v2.tu/default-test-table]
      (action-v2.tu/do-with-test-tables!
       action-v2.tu/default-test-table
       (fn [table-b]
         (doseq [action-kw [:table.row/create :data-grid.row/create]
                 table-ids [[table-a] [table-a table-b]]]
           (testing (str action-kw " on " (count table-ids) " table(s)")
             (perform-rows! action-kw table-ids 2)
             (is (= (statements! action-kw table-ids 2)
                    (statements! action-kw table-ids 6))))))))))

(deftest bulk-row-action-on-unknown-table-is-refused-test
  (mt/with-premium-features #{:table-data-editing}
    (action-v2.tu/with-test-tables! [table-id action-v2.tu/default-test-table]
      (doseq [action-kw [:table.row/create :data-grid.row/create]]
        (testing action-kw
          (let [unknown (inc (t2/select-one-fn :id [:model/Table :id] {:order-by [[:id :desc]]}))]
            (is (thrown? Throwable (perform-rows! action-kw [table-id unknown] 2)))))))))
