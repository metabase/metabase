(ns metabase-enterprise.dependencies.models.analysis-finding-error-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.models.analysis-finding-error :as deps.analysis-finding-error]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest replace-errors-for-entity!-test
  (mt/with-premium-features #{:dependencies}
    (testing "Can insert errors for an entity"
      (mt/with-empty-h2-app-db!
        (let [errors [{:error-type :missing-column
                       :error-detail "CATEGORY"
                       :source-entity-type :table
                       :source-entity-id 100}
                      {:error-type :missing-column
                       :error-detail "PRICE"
                       :source-entity-type :table
                       :source-entity-id 100}]]
          (deps.analysis-finding-error/replace-errors-for-entity! :card 1 errors)
          (let [stored (t2/select :model/AnalysisFindingError
                                  :analyzed_entity_type :card
                                  :analyzed_entity_id 1)]
            (is (= 2 (count stored)))
            (is (= #{:missing-column} (set (map :error_type stored))))
            (is (= #{"CATEGORY" "PRICE"} (set (map :error_detail stored))))
            (is (= #{:table} (set (map :source_entity_type stored))))
            (is (= #{100} (set (map :source_entity_id stored))))))))
    (testing "Replaces existing errors when called again"
      (mt/with-empty-h2-app-db!
        (let [old-errors [{:error-type :missing-column
                           :error-detail "OLD_COLUMN"
                           :source-entity-type :table
                           :source-entity-id 100}]
              new-errors [{:error-type :syntax-error
                           :error-detail nil
                           :source-entity-type nil
                           :source-entity-id nil}]]
          (deps.analysis-finding-error/replace-errors-for-entity! :card 1 old-errors)
          (is (= 1 (t2/count :model/AnalysisFindingError
                             :analyzed_entity_type :card
                             :analyzed_entity_id 1)))
          (deps.analysis-finding-error/replace-errors-for-entity! :card 1 new-errors)
          (let [stored (t2/select-one :model/AnalysisFindingError
                                      :analyzed_entity_type :card
                                      :analyzed_entity_id 1)]
            (is (= :syntax-error (:error_type stored)))
            (is (nil? (:error_detail stored)))
            (is (nil? (:source_entity_type stored)))
            (is (nil? (:source_entity_id stored)))))))
    (testing "Clears errors when passed empty list"
      (mt/with-empty-h2-app-db!
        (let [errors [{:error-type :missing-column
                       :error-detail "CATEGORY"
                       :source-entity-type :table
                       :source-entity-id 100}]]
          (deps.analysis-finding-error/replace-errors-for-entity! :card 1 errors)
          (is (= 1 (t2/count :model/AnalysisFindingError
                             :analyzed_entity_type :card
                             :analyzed_entity_id 1)))

          (deps.analysis-finding-error/replace-errors-for-entity! :card 1 [])
          (is (= 0 (t2/count :model/AnalysisFindingError
                             :analyzed_entity_type :card
                             :analyzed_entity_id 1))))))))

(deftest errors-by-source-test
  (mt/with-premium-features #{:dependencies}
    (mt/with-empty-h2-app-db!
      (testing "Can query errors by source entity"
        (let [errors-card-1 [{:error-type :missing-column
                              :error-detail "CATEGORY"
                              :source-entity-type :table
                              :source-entity-id 100}]
              errors-card-2 [{:error-type :missing-column
                              :error-detail "PRICE"
                              :source-entity-type :table
                              :source-entity-id 100}
                             {:error-type :missing-column
                              :error-detail "NAME"
                              :source-entity-type :table
                              :source-entity-id 200}]]
          (deps.analysis-finding-error/replace-errors-for-entity! :card 1 errors-card-1)
          (deps.analysis-finding-error/replace-errors-for-entity! :card 2 errors-card-2)
          (let [errors-from-100 (deps.analysis-finding-error/errors-by-source :table 100)]
            (is (= 2 (count errors-from-100)))
            (is (= #{1 2} (set (map :analyzed_entity_id errors-from-100)))))
          (let [errors-from-200 (deps.analysis-finding-error/errors-by-source :table 200)]
            (is (= 1 (count errors-from-200)))
            (is (= #{2} (set (map :analyzed_entity_id errors-from-200))))))))))

(deftest errors-for-entity-test
  (mt/with-premium-features #{:dependencies}
    (mt/with-empty-h2-app-db!
      (testing "Can query all errors for a specific entity"
        (let [errors [{:error-type :missing-column
                       :error-detail "CATEGORY"
                       :source-entity-type :table
                       :source-entity-id 100}
                      {:error-type :missing-column
                       :error-detail "PRICE"
                       :source-entity-type :card
                       :source-entity-id 50}]]
          (deps.analysis-finding-error/replace-errors-for-entity! :card 1 errors)
          (let [entity-errors (deps.analysis-finding-error/errors-for-entity :card 1)]
            (is (= 2 (count entity-errors)))
            (is (= #{"CATEGORY" "PRICE"} (set (map :error_detail entity-errors))))))))))
