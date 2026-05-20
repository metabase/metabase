(ns metabase.metabot.tools.entity-usage-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.entity-usage :as entity-usage]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel entity-usage-required?-test
  (testing "every non-utility tool-type requires entity-usage"
    (doseq [t [:discovery :authoring :inspection :hybrid]]
      (is (entity-usage/entity-usage-required? t))))
  (testing "utility tools do not require entity-usage"
    (is (not (entity-usage/entity-usage-required? :utility))))
  (testing "unknown tool-types are not required (and validate-result handles them separately)"
    (is (not (entity-usage/entity-usage-required? :bogus)))
    (is (not (entity-usage/entity-usage-required? nil)))))

(deftest ^:parallel entity-usage-schema-shape-test
  (testing "empty :input and :output lists are valid"
    (is (mr/validate entity-usage/entity-usage-schema {:input [] :output []})))

  (testing "populated entries with valid type/id are accepted"
    (is (mr/validate entity-usage/entity-usage-schema
                     {:input  [{:type "database" :id 7}]
                      :output [{:type "table" :id 42}
                               {:type "card" :id "uuid-like-string"}]})))

  (testing "optional :metadata map of arbitrary keyword keys is accepted"
    (is (mr/validate entity-usage/entity-usage-schema
                     {:input  []
                      :output [{:type "table" :id 1
                                :metadata {:rank 0
                                           :verified true
                                           :database_id 7
                                           :uri "metabase://table/1"}}]})))

  (testing "unknown entity :type is rejected"
    (is (not (mr/validate entity-usage/entity-usage-schema
                          {:input  []
                           :output [{:type "spaceship" :id 1}]}))))

  (testing "missing :input or :output is rejected (both required)"
    (is (not (mr/validate entity-usage/entity-usage-schema {:input []})))
    (is (not (mr/validate entity-usage/entity-usage-schema {:output []}))))

  (testing "extra top-level keys are rejected (closed map)"
    (is (not (mr/validate entity-usage/entity-usage-schema
                          {:input [] :output [] :other "nope"})))))

(deftest ^:parallel validate-result-utility-test
  (testing "utility tool with no :entity-usage is valid"
    (is (nil? (entity-usage/validate-result :utility {:output "ok"}))))

  (testing "utility tool that emits :entity-usage is flagged"
    (let [problem (entity-usage/validate-result
                   :utility
                   {:structured-output {:entity-usage {:input [] :output []}}})]
      (is (= :entity-usage-forbidden-for-utility (:violation problem))))))

(deftest ^:parallel validate-result-required-test
  (doseq [tool-type [:discovery :authoring :inspection :hybrid]]
    (testing (str (name tool-type) " tool with well-formed :entity-usage is valid")
      (is (nil? (entity-usage/validate-result
                 tool-type
                 {:structured-output
                  {:entity-usage {:input  [{:type "database" :id 1}]
                                  :output [{:type "table" :id 9
                                            :metadata {:rank 0}}]}}}))))

    (testing (str (name tool-type) " tool with missing :entity-usage is flagged")
      (let [problem (entity-usage/validate-result tool-type {:output "ok"})]
        (is (= :entity-usage-required-but-missing (:violation problem)))
        (is (= tool-type (:tool-type problem)))))

    (testing (str (name tool-type) " tool with malformed :entity-usage returns malli explain")
      (let [problem (entity-usage/validate-result
                     tool-type
                     {:structured-output
                      {:entity-usage {:input  [{:type "spaceship" :id 1}]
                                      :output []}}})]
        (is (some? problem))
        (is (contains? problem :errors))))))

(deftest ^:parallel validate-result-unknown-tool-type-test
  (testing "unknown :tool-type is flagged distinctly from missing usage"
    (let [problem (entity-usage/validate-result :bogus {:output "ok"})]
      (is (= :unknown-tool-type (:violation problem)))
      (is (= :bogus (:tool-type problem))))
    (let [problem (entity-usage/validate-result nil {:output "ok"})]
      (is (= :unknown-tool-type (:violation problem))))))
