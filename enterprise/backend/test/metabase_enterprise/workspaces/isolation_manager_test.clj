(ns ^:mb/driver-tests metabase-enterprise.workspaces.isolation-manager-test
  "Tests for metabase-enterprise.workspaces.isolation-manager."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as =?]
   [metabase-enterprise.workspaces.isolation-manager :as isolation-manager]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]))

(deftest create-isolation-test
  (mt/test-drivers #{:postgres :clickhouse}
    (let [db (mt/db)
          result (isolation-manager/create-isolation (:engine db) (:details db) "test-workspace-123")]
      (try
        (is (=? {:isolation-type (=?/malli [:enum :database :schema])
                 :populator {:user (=?/malli :string) :password (=?/malli :string)}}
                result))
        (if (= :database (:isolation-type result))
          (is (not (str/blank? (:database-name result))))
          (is (not (str/blank? (:schema-name result)))))
        (if (= :schema (:isolation-type result))
          (is (str/starts-with? (:schema-name result) "mb__isolation_"))
          (is (str/starts-with? (:database-name result) "mb__isolation_")))
        (is (str/includes? (-> result :populator :user) "populator"))
        (finally
          (isolation-manager/delete-isolation (:engine db) (:details db) "test-workspace-123" result))))))

(def driver-creates
  {:postgres "create table %s.%s (id int, stuff text)"
   :clickhouse "CREATE TABLE %s.%s (id Int32, stuff String) ENGINE = MergeTree() ORDER BY id"})

(deftest e2e
  (mt/test-drivers #{:postgres :clickhouse}
    (let [db (mt/db)
          details (:details db)
          workspace-id (str (gensym "testing-workspace"))
          isolation-info (isolation-manager/create-isolation (:engine db) details workspace-id)]
      (letfn [(run-query! [user-info read|write sql]
                (assert (every? user-info [:user :password]))
                (let [spec (sql-jdbc.conn/connection-details->spec (:engine db)
                                                                   (merge details user-info))]
                  (try {:success true
                        :results (if (= read|write :read)
                                   (jdbc/query spec sql)
                                   (jdbc/execute! spec sql))}
                       (catch Exception e
                         {:error true
                          :message  (ex-message e)
                          #_#_:e e
                          :query sql :user-info user-info}))))]
        (try
          (let [{:keys [query]} (qp.compile/compile (mt/mbql-query venues {:limit 10}))
                {:keys [populator isolation-type]} isolation-info
                isolation (isolation-info (if (= :schema isolation-type) :schema-name :database-name))
                temp-table (str (gensym "some_table"))]
            (testing "populator can query original data"
              (is (=? {:success true} (run-query! populator :read query))))
            (testing "populator can populate new schema"
              (is (=? {:success true} (run-query! populator :write (format (driver-creates (:engine db)) isolation temp-table)))))
            (testing "populator can delete table in new schema"
              (is (=? {:success true} (run-query! populator :write (format "DROP table %s.%s" isolation temp-table)))))
            (testing "populator can recreate dropped table"
              (is (=? {:success true} (run-query! populator :write (format (driver-creates (:engine db)) isolation temp-table))))))
          (finally
            (isolation-manager/delete-isolation (:engine db) (:details db) workspace-id
                                                isolation-info)))))))

(deftest evaluator-test
  (let [steps [:overall
               {}
               [:subgoal1 {} "action1" "action2"]
               [:subgoal2 {}
                "action3"
                [:subsubgoal {} "action4"]]]]
    (testing "general evaluation works"
      (let [result (#'isolation-manager/evaluate-steps steps (fn [x] [:success x]))]
        (is (= [[[:tree :overall]
                 [:tree :subgoal1]
                 [:success "action1"]
                 [:success "action2"]
                 [:tree :subgoal2]
                 [:success "action3"]
                 [:tree :subsubgoal]
                 [:success "action4"]]
                :running] result))))
    (testing "errors prevent more work"
      (let [result (#'isolation-manager/evaluate-steps steps (fn [x]
                                                               (if (= x "action2")
                                                                 [:error "action2 is failed"]
                                                                 [:success x])))]
        (is (= [[[:tree :overall]
                 [:tree :subgoal1]
                 [:success "action1"]
                 [:error "action2 is failed"]
                 [:skipping-tree :subgoal2]]
                :error]
               result)))))
  (testing "errors can be marked recoverable"
    (let [steps [:cleanup {:error-strategy ::isolation-manager/continue-on-error}
                 [:remove-privileges {} "revoke privileges"]
                 [:remove-schema {} "drop schema"]
                 [:remove-user {} "drop user"]]
          result (#'isolation-manager/evaluate-steps steps
                                                     (fn [x]
                                                       [:error x "failed"]))]
      (is (= [[[:tree :cleanup]
               [:tree :remove-privileges]
               [:error "revoke privileges" "failed"]
               [:tree :remove-schema]
               [:error "drop schema" "failed"]
               [:tree :remove-user]
               [:error "drop user" "failed"]]
              :running] result))))
  (testing "can error one subtree and then continue"
    (let [steps [:overall-with-continue
                 {:error-strategy ::isolation-manager/continue-on-error}
                 [:subgoal1-with-fail {:error-strategy ::isolation-manager/fail} "action1" "action2"]
                 [:subgoal2 {}
                  "action3"
                  [:subsubgoal {} "action4"]]]
          results (#'isolation-manager/evaluate-steps steps
                                                      (fn [x]
                                                        (if (= x "action1")
                                                          [:error x]
                                                          [:success x])))]
      (is (= [[[:tree :overall-with-continue]
               [:tree :subgoal1-with-fail] [:error "action1"] [:skipping-step "action2"]
               [:tree :subgoal2] [:success "action3"]
               [:tree :subsubgoal] [:success "action4"]]
              :running]
             results))))
  (testing "can error one subtree and then continue"
    (let [steps [:overall-with-continue
                 {:error-strategy ::isolation-manager/continue-on-error}
                 [:subgoal1-with-fail {:error-strategy ::isolation-manager/fail}
                  "action1" "action2"
                  [:subtree-should-be-skipped {} "not-important1" "not-important2"]]
                 [:subgoal2 {}
                  "action3"
                  [:subsubgoal {} "action4"]]]
          results (#'isolation-manager/evaluate-steps steps
                                                      (fn [x]
                                                        (if (= x "action1")
                                                          [:error x]
                                                          [:success x])))]
      (is (= [[[:tree :overall-with-continue]
               [:tree :subgoal1-with-fail]
               [:error "action1"] [:skipping-step "action2"]
               ;; tree maintains the failure strategy
               [:skipping-tree :subtree-should-be-skipped]
               ;; but popping back out continues according to main strategy
               [:tree :subgoal2] [:success "action3"]
               [:tree :subsubgoal] [:success "action4"]]
              :running]
             results))))
  (testing "rules can be opaque"
    (let [steps [:compute {}
                 [+ 1]
                 [+ 1]
                 [:multiply {}
                  [* 10] [* 5]]
                 [:divide {:error-strategy ::isolation-manager/continue-on-error}
                  [/ 2] [/ 0]]
                 [:subtract
                  {}
                  [- 10]]]]
      (let [result (atom 0)
            results (#'isolation-manager/evaluate-steps steps (fn [[op x]]
                                                                (try
                                                                  [:success (swap! result op x)]
                                                                  (catch Exception _e
                                                                    [:error :failed]))))]
        (is (=? [[[:tree :compute]
                  [:success 1]
                  [:success 2]
                  [:tree :multiply]
                  [:success 20]
                  [:success 100]
                  [:tree :divide]
                  [:success 50]
                  [:error :failed]
                  [:tree :subtract]
                  [:success 40]]
                 :running]
                results)
            (= 50 @result))))))

(comment
  (run-tests)
  (mt/set-test-drivers! #{:postgres :clickhouse})
  (mt/set-test-drivers! #{:postgres})
  (mt/set-test-drivers! #{:clickhouse})
  (do (run-test e2e)
      (run-test create-isolation-test))

  {:isolation-type :schema
   :schema-name "mb__isolation_7748c_test_workspace_123"
   :populator {:user "mb_iso_7748c_test_workspace_123_populator"
               :password "d632f61c-398a-467d-856c-d8411665bd0f"}}
  (mt/test-drivers #{:postgres}
    (let [db (mt/db)]
      (isolation-manager/delete-isolation (:engine db) (:details db) "test-workspace-123")
      (tap> (isolation-manager/create-isolation (:engine db) (:details db) "test-workspace-123"))))
  (mt/test-drivers #{:postgres}
    (let [db (mt/db)
          engine (:engine db)
          connection-details (:details db)

          ;; Simple API call
          result (isolation-manager/create-isolation engine connection-details "demo-workspace")]
      (try
        (tap> result)
        (def result result)
        (finally
          (isolation-manager/delete-isolation engine connection-details "demo-workspace" result)
          (println "Cleaned up demo"))))))
