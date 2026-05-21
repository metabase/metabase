(ns metabase.metabot.tools.transforms-test
  "Tests for agent-level transform tool wrappers, particularly the
  dependency checking integration in write-transform-sql-tool."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.dependencies :as deps]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.transforms :as agent-transforms]
   [metabase.metabot.tools.transforms.write :as transforms-write]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.transforms.core :as transforms]
   [metabase.util.malli.registry :as mr]))

;;; ----------------------------------- write tool integration tests --------------------------------------------------

(deftest write-transform-sql-tool-test
  (testing "creates new SQL transform with correct name, SQL content, and output message"
    (let [memory-atom (atom {:state {}})
          result (binding [shared/*memory-atom* memory-atom]
                   (agent-transforms/write-transform-sql-tool
                    {:edit_action {:mode "replace" :new_content "SELECT id FROM orders"}
                     :transform_name "Orders Transform"
                     :database_id (mt/id)}))]
      (is (= "SELECT id FROM orders"
             (some-> (get-in result [:structured-output :transform :source :query])
                     lib/raw-native-query)))
      (is (= "Transform SQL updated successfully." (:output result)))
      (is (= "transform_suggestion" (-> result :data-parts first :data-type))))))

(deftest write-transform-python-tool-test
  (when (premium-features/has-feature? :transforms-python)
    (testing "creates new Python transform with correct body, source tables, and output message"
      (let [memory-atom (atom {:state {}})
            result (binding [shared/*memory-atom* memory-atom]
                     (agent-transforms/write-transform-python-tool
                      {:edit_action {:mode "replace" :new_content "import common\ndef transform(t): return t"}
                       :transform_name "Python Transform"
                       :database_id (mt/id)
                       :source_tables [{:alias "t" :table_id 10 :schema "PUBLIC" :database_id (mt/id)}]}))]
        (is (= "import common\ndef transform(t): return t"
               (get-in result [:structured-output :transform :source :body])))
        (is (= [{:alias "t" :table_id 10 :schema "PUBLIC" :database_id (mt/id)}]
               (get-in result [:structured-output :transform :source :source-tables])))
        (is (= "transform_suggestion" (-> result :data-parts first :data-type)))))))

(deftest write-transform-tool-nil-transform-id-test
  (when (premium-features/has-feature? :transforms-python)
    (testing "SQL: nil transform_id creates fresh transform with nil :id and does not store in memory"
      (let [memory-atom (atom {:state {:transforms {}}})
            result (binding [shared/*memory-atom* memory-atom]
                     (agent-transforms/write-transform-sql-tool
                      {:transform_id nil
                       :edit_action {:mode "replace" :new_content "SELECT 1"}
                       :transform_name "Fresh SQL"
                       :database_id (mt/id)}))]
        (is (nil? (get-in result [:structured-output :transform :id])))
        (is (empty? (get-in @memory-atom [:state :transforms])))
        (is (= "transform_suggestion" (-> result :data-parts first :data-type)))))
    (testing "Python: nil transform_id creates fresh transform with nil :id and does not store in memory"
      (let [memory-atom (atom {:state {:transforms {}}})
            result (binding [shared/*memory-atom* memory-atom]
                     (agent-transforms/write-transform-python-tool
                      {:transform_id nil
                       :edit_action {:mode "replace" :new_content "import common\ndef transform(): pass"}
                       :transform_name "Fresh Python"
                       :database_id (mt/id)
                       :source_tables [{:alias "t" :table_id 1 :schema "PUBLIC" :database_id (mt/id)}]}))]
        (is (nil? (get-in result [:structured-output :transform :id])))
        (is (empty? (get-in @memory-atom [:state :transforms])))
        (is (= "transform_suggestion" (-> result :data-parts first :data-type)))))))

;;; ----------------------------------- dependency check integration tests -------------------------------------------

(deftest write-transform-sql-dependency-check-no-issues-test
  (testing "when check-dependencies returns nil (no issues) → result unchanged, no extra instructions"
    (let [memory-atom (atom {:state {}})
          base-result {:structured-output {:transform {:id 1
                                                       :name "Test"
                                                       :source {:type "query" :query "SELECT 1"}}
                                           :message "Transform updated successfully."}
                       :data-parts [{:type :data :data-type "transform_suggestion" :version 1}]}]
      (mt/with-dynamic-fn-redefs [transforms-write/write-transform-sql (fn [_] base-result)
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
      (mt/with-dynamic-fn-redefs [transforms-write/write-transform-sql (fn [_] base-result)
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
      (mt/with-dynamic-fn-redefs [transforms-write/write-transform-sql (fn [_] base-result)
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
      (mt/with-dynamic-fn-redefs [transforms-write/write-transform-sql (fn [_] base-result)
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
      (mt/with-dynamic-fn-redefs [transforms-write/write-transform-sql (fn [_] base-result)
                                  deps/check-transform-dependencies    (fn [_] (reset! dep-called? true) nil)]
        (let [result (binding [shared/*memory-atom* memory-atom]
                       (agent-transforms/write-transform-sql-tool
                        {:edit_action {:mode "replace" :new_content "SELECT 1"}
                         :transform_name "New Transform"}))]
          (is (false? @dep-called?))
          (is (nil? (:instructions result)))
          (is (some? (:output result))))))))

;;; ----------------------------------- entity-usage ----------------------------------------

(deftest entity-usage-for-transform-test
  (testing "builds :entity-usage from transform args"
    (testing "database alone"
      (is (= {:input  [{:type "database" :id 1}]
              :output []}
             (agent-transforms/entity-usage-for-transform {:database_id 1} nil))))
    (testing "nil database is omitted"
      (is (= {:input [] :output []}
             (agent-transforms/entity-usage-for-transform {} nil))))
    (testing "source-tables expand to {:type \"table\" :id N}"
      (is (= {:input  [{:type "database" :id 1}
                       {:type "table"    :id 10}
                       {:type "table"    :id 11}]
              :output []}
             (agent-transforms/entity-usage-for-transform
              {:database_id   1
               :source_tables [{:alias "a" :table_id 10 :schema "PUBLIC" :database_id 1}
                               {:alias "b" :table_id 11 :schema "PUBLIC" :database_id 1}]}
              nil))))
    (testing "SQL body adds {{#N}} card refs"
      (is (= {:input  [{:type "database" :id 1}
                       {:type "card"     :id 42}
                       {:type "card"     :id 43}]
              :output []}
             (agent-transforms/entity-usage-for-transform
              {:database_id 1}
              "SELECT * FROM {{#42}} JOIN {{#43-slug}} t ON t.id = 1"))))
    (testing "nil SQL body skips card-ref extraction"
      (is (= {:input  [{:type "database" :id 1}]
              :output []}
             (agent-transforms/entity-usage-for-transform {:database_id 1} nil))))))

(deftest write-transform-sql-entity-usage-success-test
  (testing "write_transform_sql success path emits :entity-usage with database + {{#N}} from new SQL"
    (let [memory-atom (atom {:state {}})
          result      (binding [shared/*memory-atom* memory-atom]
                        (agent-transforms/write-transform-sql-tool
                         {:edit_action {:mode "replace" :new_content "SELECT id FROM {{#42}} JOIN {{#43-orders}} o ON o.id = 1"}
                          :transform_name "Test"
                          :database_id (mt/id)}))
          eu          (get-in result [:structured-output :entity-usage])]
      (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
      (is (= [] (:output eu)))
      (is (= [{:type "database" :id (mt/id)}
              {:type "card"     :id 42}
              {:type "card"     :id 43}]
             (:input eu))))))

(deftest write-transform-sql-entity-usage-error-test
  (testing "write_transform_sql exception path falls back to args-derived :entity-usage"
    (let [memory-atom (atom {:state {}})]
      (mt/with-dynamic-fn-redefs [transforms-write/write-transform-sql
                                  (fn [_] (throw (Exception. "boom")))]
        (let [result (binding [shared/*memory-atom* memory-atom]
                       (agent-transforms/write-transform-sql-tool
                        {:edit_action {:mode "replace" :new_content "SELECT 1"}
                         :transform_name "Test"
                         :database_id 99}))
              eu     (get-in result [:structured-output :entity-usage])]
          (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
          (is (= [{:type "database" :id 99}] (:input eu)))
          (is (= [] (:output eu)))
          (is (str/includes? (:output result) "boom")))))))

(deftest write-transform-python-entity-usage-success-test
  (when (premium-features/has-feature? :transforms-python)
    (testing "write_transform_python success path emits :entity-usage with database + source-tables"
      (let [memory-atom (atom {:state {}})
            result      (binding [shared/*memory-atom* memory-atom]
                          (agent-transforms/write-transform-python-tool
                           {:edit_action {:mode "replace" :new_content "import common\ndef transform(t): return t"}
                            :transform_name "Test"
                            :database_id (mt/id)
                            :source_tables [{:alias "t" :table_id 7 :schema "PUBLIC" :database_id (mt/id)}]}))
            eu          (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= [] (:output eu)))
        (is (= [{:type "database" :id (mt/id)}
                {:type "table"    :id 7}]
               (:input eu)))))))

;;; ----------------------------------- entity-usage / inspection ----------------------------------------

(deftest transform-inspection-entity-usage-test
  (testing "wraps a single id under :type \"transform\" with empty :output"
    (is (= {:input  [{:type "transform" :id 7}]
            :output []}
           (agent-transforms/transform-inspection-entity-usage 7)))
    (testing "accepts string ids (python library path)"
      (is (= {:input  [{:type "transform" :id "common.py"}]
              :output []}
             (agent-transforms/transform-inspection-entity-usage "common.py"))))))

(deftest get-transform-details-entity-usage-success-test
  (testing "get_transform_details success path emits :entity-usage with the requested transform"
    (mt/with-dynamic-fn-redefs [transforms/get-transform
                                (fn [id] {:id id :name "fake" :description "" :source {} :target {}})]
      (let [result (agent-transforms/get-transform-details-tool {:transform_id 99})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input  [{:type "transform" :id 99}]
                :output []}
               eu))
        (is (string? (:output result)))))))

(deftest get-transform-details-entity-usage-error-test
  (testing "get_transform_details agent-error catch still emits :entity-usage"
    (mt/with-dynamic-fn-redefs [transforms/get-transform
                                (fn [_] (throw (ex-info "boom" {:agent-error? true})))]
      (let [result (agent-transforms/get-transform-details-tool {:transform_id 7})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input  [{:type "transform" :id 7}]
                :output []}
               eu))
        (is (= "boom" (:output result)))))))

(deftest get-transform-python-library-details-oss-entity-usage-test
  (testing "OSS stub emits :entity-usage with path-as-id and EE-only message"
    (when-not (premium-features/has-feature? :transforms-python)
      (let [result (agent-transforms/get-transform-python-library-details-tool {:path "common"})
            eu     (get-in result [:structured-output :entity-usage])]
        (is (nil? (mr/explain entity-usage/entity-usage-schema eu)))
        (is (= {:input  [{:type "transform" :id "common"}]
                :output []}
               eu))
        (is (str/includes? (:output result) "Enterprise"))))))
