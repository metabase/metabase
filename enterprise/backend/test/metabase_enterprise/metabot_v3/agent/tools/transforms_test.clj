(ns metabase-enterprise.metabot-v3.agent.tools.transforms-test
  "Tests for agent-level transform tool wrappers, particularly the
  dependency checking integration in write-transform-sql-tool."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.agent.tools.transforms :as agent-transforms]
   [metabase-enterprise.metabot-v3.tools.dependencies :as deps]
   [metabase-enterprise.metabot-v3.tools.transforms-write :as transforms-write]))

;;; ----------------------------------- dependency check integration tests -------------------------------------------

(deftest write-transform-sql-dependency-check-no-issues-test
  (testing "when check-dependencies returns nil (no issues) → result unchanged, no extra instructions"
    (let [memory-atom (atom {:state {}})
          base-result {:structured-output {:transform {:id 1
                                                       :name "Test"
                                                       :source {:type "query" :query "SELECT 1"}}
                                           :message "Transform updated successfully."}
                       :data-parts [{:type :data :data-type "transform_suggestion" :version 1}]}]
      (with-redefs [transforms-write/write-transform-sql (fn [_] base-result)
                    deps/check-transform-dependencies    (fn [_] {:structured_output {:success true
                                                                                      :bad_transforms []
                                                                                      :bad_questions nil}})]
        (let [result (binding [shared/*memory-atom* memory-atom]
                       (agent-transforms/write-transform-sql-tool
                        {:transform_id 1
                         :edit_action {:mode "replace" :new_content "SELECT 1"}}))]
          (is (nil? (:instructions result)))
          (is (some? (:output result))))))))

(deftest write-transform-sql-dependency-check-broken-transforms-test
  (testing "when check-dependencies returns bad_transforms → instructions appended with transform links"
    (let [memory-atom (atom {:state {}})
          base-result {:structured-output {:transform {:id 1
                                                       :name "Test"
                                                       :source {:type "query" :query "SELECT id FROM orders"}}
                                           :message "Transform updated successfully."}
                       :data-parts [{:type :data :data-type "transform_suggestion" :version 1}]}]
      (with-redefs [transforms-write/write-transform-sql (fn [_] base-result)
                    deps/check-transform-dependencies    (fn [_]
                                                           {:structured_output
                                                            {:success false
                                                             :bad_transform_count 1
                                                             :bad_transforms [{:transform {:id 2 :name "Downstream Transform"}
                                                                               :errors ["Column 'total' not found"]}]
                                                             :bad_questions nil}})]
        (let [result (binding [shared/*memory-atom* memory-atom]
                       (agent-transforms/write-transform-sql-tool
                        {:transform_id 1
                         :edit_action {:mode "replace" :new_content "SELECT id FROM orders"}}))]
          (is (some? (:instructions result)))
          (is (str/includes? (:instructions result) "Dependency issues detected"))
          (is (str/includes? (:instructions result) "Broken transforms"))
          (is (str/includes? (:instructions result) "Downstream Transform"))
          (is (str/includes? (:instructions result) "metabase://transform/2")))))))

(deftest write-transform-sql-dependency-check-broken-questions-test
  (testing "when check-dependencies returns bad_questions → instructions appended with question links"
    (let [memory-atom (atom {:state {}})
          base-result {:structured-output {:transform {:id 1
                                                       :name "Test"
                                                       :source {:type "query" :query "SELECT id FROM orders"}}
                                           :message "Transform updated successfully."}
                       :data-parts [{:type :data :data-type "transform_suggestion" :version 1}]}]
      (with-redefs [transforms-write/write-transform-sql (fn [_] base-result)
                    deps/check-transform-dependencies    (fn [_]
                                                           {:structured_output
                                                            {:success false
                                                             :bad_transform_count 0
                                                             :bad_transforms []
                                                             :bad_question_count 2
                                                             :bad_questions [{:question {:id 10 :name "Revenue Report"}
                                                                              :errors ["Column 'total' not found"]}
                                                                             {:question {:id 11 :name "Monthly Summary"}
                                                                              :errors ["Column 'total' not found"]}]}})]
        (let [result (binding [shared/*memory-atom* memory-atom]
                       (agent-transforms/write-transform-sql-tool
                        {:transform_id 1
                         :edit_action {:mode "replace" :new_content "SELECT id FROM orders"}}))]
          (is (some? (:instructions result)))
          (is (str/includes? (:instructions result) "Broken questions"))
          (is (str/includes? (:instructions result) "Revenue Report"))
          (is (str/includes? (:instructions result) "metabase://question/10"))
          (is (str/includes? (:instructions result) "Monthly Summary"))
          (is (str/includes? (:instructions result) "metabase://question/11")))))))

(deftest write-transform-sql-dependency-check-error-test
  (testing "when check-dependencies throws → graceful degradation (no crash, result unchanged)"
    (let [memory-atom (atom {:state {}})
          base-result {:structured-output {:transform {:id 1
                                                       :name "Test"
                                                       :source {:type "query" :query "SELECT 1"}}
                                           :message "Transform updated successfully."}
                       :data-parts [{:type :data :data-type "transform_suggestion" :version 1}]}]
      (with-redefs [transforms-write/write-transform-sql (fn [_] base-result)
                    deps/check-transform-dependencies    (fn [_] (throw (Exception. "DB connection failed")))]
        (let [result (binding [shared/*memory-atom* memory-atom]
                       (agent-transforms/write-transform-sql-tool
                        {:transform_id 1
                         :edit_action {:mode "replace" :new_content "SELECT 1"}}))]
          ;; Should succeed without instructions — the dep check failure is logged but not propagated
          (is (nil? (:instructions result)))
          (is (some? (:output result))))))))

(deftest write-transform-sql-dependency-check-new-transform-test
  (testing "new transforms (no transform_id) → dependency check skipped"
    (let [memory-atom (atom {:state {}})
          dep-called? (atom false)
          base-result {:structured-output {:transform {:name "New Transform"
                                                       :source {:type "query" :query "SELECT 1"}}
                                           :message "Transform created successfully."}
                       :data-parts [{:type :data :data-type "transform_suggestion" :version 1}]}]
      (with-redefs [transforms-write/write-transform-sql (fn [_] base-result)
                    deps/check-transform-dependencies    (fn [_] (reset! dep-called? true) nil)]
        (let [result (binding [shared/*memory-atom* memory-atom]
                       (agent-transforms/write-transform-sql-tool
                        {:edit_action {:mode "replace" :new_content "SELECT 1"}
                         :transform_name "New Transform"}))]
          (is (false? @dep-called?))
          (is (nil? (:instructions result)))
          (is (some? (:output result))))))))
