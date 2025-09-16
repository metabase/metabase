(ns metabase-enterprise.dependencies.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Datasets                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mt/defdataset switch-tables-data
  [["table_a"
    [{:field-name "id"   :base-type :type/Integer :pk? true}
     {:field-name "name" :base-type :type/Text}]
    [[1 "Data A"]]]
   ["table_b"
    [{:field-name "id"   :base-type :type/Integer :pk? true}
     {:field-name "name" :base-type :type/Text}]
    [[1 "Data B"]
     [2 "Data B2"]]]])

(mt/defdataset mismatched-schema-data
  [["table_a"
    [{:field-name "id"   :base-type :type/Integer :pk? true}
     {:field-name "name" :base-type :type/Text}]
    [[1 "Data A"]]]
   ["table_c"
    [{:field-name "id"     :base-type :type/Integer :pk? true}
     {:field-name "nombre" :base-type :type/Text}]
    [[1 "Data B"]]]])

(mt/defdataset multi-switch-data
  (for [i (range 4)]
    [(str "table_" (char (+ (int \a) i)))
     [{:field-name "id" :base-type :type/Integer :pk? true}]
     [[(inc i)]]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Tests                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest switch-tables-test
  (testing "POST /api/ee/dependencies/switch_tables"
    (testing "should be able to switch a table in a card"
      (mt/with-premium-features #{:dependencies}
        (mt/dataset switch-tables-data
          (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query table_a)}]
            (let [run-query (fn [card-to-run]
                              (qp/process-query (:dataset_query card-to-run)))]
              (testing "before switch"
                (let [result (run-query card)]
                  (is (= [[1 "Data A"]] (mt/rows result)))))

              (testing "api call"
                (is (= {:success true}
                       (mt/user-http-request :crowberto
                                             :post "ee/dependencies/switch_tables"
                                             {:table_mapping [[(mt/id :table_a) (mt/id :table_b)]]}))))

              (testing "after switch"
                (let [updated-card (t2/select-one :model/Card (:id card))
                      result       (run-query updated-card)]
                  (is (= [[1 "Data B"] [2 "Data B2"]] (mt/rows result))))))))))))

(deftest switch-tables-error-handling-test
  (testing "Error handling for POST/api/ee/dependencies/switch_tables"
    (mt/with-premium-features #{:dependencies}
      (testing "should fail for non-admin users"
        (mt/dataset switch-tables-data
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/dependencies/switch_tables"
                                       {:table_mapping [[(mt/id :table_a) (mt/id :table_b)]]})))))

      (testing "should fail when switching tables with mismatched schemas"
        (mt/dataset mismatched-schema-data
          (is (=? #"(?i)Schemas do not match: Field 'name' not found in destination table."
                  (mt/user-http-request :crowberto :post 400 "ee/dependencies/switch_tables"
                                        {:table_mapping [[(mt/id :table_a) (mt/id :table_c)]]})))))

      (testing "should fail when switching tables across different databases"
        (mt/with-temp [:model/Database {db2-id :id}    {}
                       :model/Table    {table2-id :id} {:db_id db2-id}]
          (mt/dataset switch-tables-data
            (is (= {:errors {:table_mapping "table_mapping should map tables in the same database"}}
                   (mt/user-http-request :crowberto :post 400 "ee/dependencies/switch_tables"
                                         {:table_mapping [[(mt/id :table_a) table2-id]]}))))))

      (testing "should fail for non-existent tables"
        (mt/dataset switch-tables-data
          (is (= {:errors {:table_mapping "One or more table IDs do not exist."}}
                 (mt/user-http-request :crowberto :post 400 "ee/dependencies/switch_tables"
                                       {:table_mapping [[(mt/id :table_a) Integer/MAX_VALUE]]}))))))))

(deftest switch-tables-complex-scenarios-test
  (testing "Complex scenarios for POST /api/ee/dependencies/switch_tables"
    (mt/with-premium-features #{:dependencies}
      (testing "should handle multiple table switches in one call"
        (mt/dataset multi-switch-data
          (mt/with-temp [:model/Card card-a {:dataset_query (mt/mbql-query table_a)}
                         :model/Card card-c {:dataset_query (mt/mbql-query table_c)}]
            (is (= {:success true}
                   (mt/user-http-request :crowberto :post 200 "ee/dependencies/switch_tables"
                                         {:table_mapping [[(mt/id :table_a) (mt/id :table_b)]
                                                          [(mt/id :table_c) (mt/id :table_d)]]})))
            (is (= (mt/id :table_b)
                   (-> (t2/select-one-fn :dataset_query :model/Card (:id card-a)) :query :source-table)))
            (is (= (mt/id :table_d)
                   (-> (t2/select-one-fn :dataset_query :model/Card (:id card-c)) :query :source-table))))))

      (testing "should handle no-op switches (A -> A)"
        (mt/dataset switch-tables-data
          (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query table_a)}]
            (let [original-query (:dataset_query card)]
              (is (= {:success true}
                     (mt/user-http-request :crowberto :post 200 "ee/dependencies/switch_tables"
                                           {:table_mapping [[(mt/id :table_a) (mt/id :table_a)]]})))
              (let [query-after-switch (t2/select-one-fn :dataset_query :model/Card (:id card))]
                (is (= original-query query-after-switch))))))))))

(deftest switch-tables-broader-scope-test
  (testing "Broader scope for POST /api/ee/dependencies/switch_tables"
    (mt/with-premium-features #{:dependencies}
      (testing "should update dependent questions when a model's table is switched"
        (mt/dataset switch-tables-data
          (mt/with-temp [:model/Card model {:dataset_query (mt/mbql-query table_a)
                                            :type :model}
                         :model/Card dependent {:dataset_query (mt/mbql-query nil {:source-table (str "card__" (:id model))})}]
            (testing "dependent card should query table_a before switch"
              (is (= [[1 "Data A"]] (mt/rows (qp/process-query (:dataset_query dependent))))))

            (is (= {:success true}
                   (mt/user-http-request :crowberto :post 200 "ee/dependencies/switch_tables"
                                         {:table_mapping [[(mt/id :table_a) (mt/id :table_b)]]})))

            (testing "dependent card should query table_b after switch"
              (let [updated-dependent-query (t2/select-one-fn :dataset_query :model/Card (:id dependent))]
                (is (= [[1 "Data B"] [2 "Data B2"]] (mt/rows (qp/process-query updated-dependent-query))))))))))))

(deftest switch-tables-metrics-and-transforms-test
  (testing "POST /api/ee/dependencies/switch_tables with metrics and transforms"
    (mt/with-premium-features #{:dependencies}
      (testing "should update metrics"
        (mt/dataset switch-tables-data
          (mt/with-temp [:model/Card metric {:dataset_query (mt/mbql-query table_a {:aggregation [[:count]]})
                                             :type          :metric}]
            (let [run-query (fn [card-to-run] (qp/process-query (:dataset_query card-to-run)))]
              (testing "metric should count 1 row before switch"
                (is (= [[1]] (mt/rows (run-query metric)))))

              (is (= {:success true}
                     (mt/user-http-request :crowberto :post 200 "ee/dependencies/switch_tables"
                                           {:table_mapping [[(mt/id :table_a) (mt/id :table_b)]]})))

              (testing "metric should count 2 rows after switch"
                (let [updated-metric (t2/select-one :model/Card (:id metric))]
                  (is (= [[2]] (mt/rows (run-query updated-metric))))))))))

      (testing "should update transforms"
        (mt/dataset switch-tables-data
          (mt/with-temp [:model/Transform transform {:source (mt/mbql-query table_a {:filter [:> $id 0]})}]
            (is (= {:success true}
                   (mt/user-http-request :crowberto :post 200 "ee/dependencies/switch_tables"
                                         {:table_mapping [[(mt/id :table_a) (mt/id :table_b)]]})))
            (let [updated-transform-query (t2/select-one-fn :source :model/Transform (:id transform))]
              (is (= (mt/mbql-query table_b {:filter [:> $id 0]})
                     updated-transform-query)))))))))
