(ns metabase.db.custom-migrations.metrics-v2-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer [deftest is testing]]
   [metabase.db.custom-migrations.metrics-v2 :as metrics-v2]))

(deftest convert-metric-v2-test
  (testing "basic metric"
    (let [metric-definition {:source-table 5
                             :aggregation [["sum" ["field" 41 nil]]]
                             :filter ["=" ["field" 35 nil] 3]}
          metric-v1 {:description "basic description"
                     :archived false
                     :table_id 5
                     :definition (json/generate-string metric-definition)
                     :show_in_getting_started false
                     :name "orders 3 tax subtotal sum"
                     :caveats nil
                     :creator_id 1
                     :updated_at #t "2024-05-02T19:26:15.490874Z"
                     :id 1
                     :how_is_this_calculated nil
                     :entity_id "4VxI6n9qFXOk1bAqbh_Us"
                     :created_at #t "2024-05-02T19:26:15.490874Z"
                     :points_of_interest nil}
          dataset-query {:type "query"
                         :database 1
                         :query {:source-table 5
                                 :aggregation [["sum" ["field" 41 nil]]]
                                 :filter ["=" ["field" 35 nil] 3]}}
          metric-v2 {:description "basic description (Migrated from metric 1.)"
                     :archived false
                     :table_id 5
                     :enable_embedding false
                     :query_type "query"
                     :name "orders 3 tax subtotal sum"
                     :type "metric"
                     :creator_id 1
                     :dataset_query dataset-query
                     :parameter_mappings "[]"
                     :display "line"
                     :visualization_settings "{}"
                     :parameters "[]"
                     :created_at #t "2024-05-02T19:26:15.490874Z"}]
      (is (= metric-v2 (-> (#'metrics-v2/convert-metric-v2 metric-v1 1)
                           (update :dataset_query json/parse-string true)))))))

(deftest rewrite-single-metric-consuming-card-test
  (let [metric-dataset-query {:type "query"
                              :database 1
                              :query {:source-table 5
                                      :aggregation [["sum" ["field" 41 nil]]]
                                      :filter ["=" ["field" 35 nil] 3]}}
        metric-card {:description "basic description (Migrated from metric 1.)"
                     :id 11
                     :archived false
                     :table_id 5
                     :enable_embedding false
                     :query_type "query"
                     :name "orders 3 tax subtotal sum"
                     :type "metric"
                     :creator_id 1
                     :dataset_query (json/generate-string metric-dataset-query)
                     :parameter_mappings "[]"
                     :display "line"
                     :visualization_settings "{}"
                     :parameters "[]"
                     :created_at #t "2024-05-02T19:26:15Z"}
        dataset-query {:type "query"
                       :database 1
                       :query {:source-table 5
                               :aggregation [["count"] ["metric" 1]]
                               :filter ["<" ["field" 33 nil] 100]}}
        card {:description "query description"
              :archived true
              :table_id 5
              :enable_embedding true
              :query_type "query"
              :name "v1 metric consuming query"
              :type "question"
              :creator_id 2
              :dataset_query (json/generate-string dataset-query)
              :parameter_mappings "[{}]"
              :display "table"
              :visualization_settings "{}"
              :parameters "[3]"
              :created_at #t "2024-05-02T19:26:15Z"}
        rewritten-dataset-query (assoc-in dataset-query [:query :aggregation 1 1] 11)
        rewritten-card {:description "query description"
                        :archived true
                        :table_id 5
                        :enable_embedding true
                        :query_type "query"
                        :name "v1 metric consuming query"
                        :type "question"
                        :creator_id 2
                        :dataset_query rewritten-dataset-query
                        :parameter_mappings "[{}]"
                        :display "table"
                        :visualization_settings "{}"
                        :parameters "[3]"
                        :created_at #t "2024-05-02T19:26:15Z"}]
    (is (= rewritten-card
           (-> (#'metrics-v2/rewrite-metric-consuming-card card {1 metric-card})
               (update :dataset_query json/parse-string true))))))

(deftest rewrite-multi-metric-consuming-card-test
  (let [metric1-dataset-query {:type "query"
                               :database 1
                               :query {:source-table 5
                                       :aggregation [["sum" ["field" 41 nil]]]
                                       :filter ["=" ["field" 35 nil] 3]}}
        metric1-card {:description "basic description (Migrated from metric 1.)"
                      :id 11
                      :archived false
                      :table_id 5
                      :enable_embedding false
                      :query_type "query"
                      :name "orders 3 tax subtotal sum"
                      :type "metric"
                      :creator_id 1
                      :dataset_query (json/generate-string metric1-dataset-query)
                      :parameter_mappings "[]"
                      :display "line"
                      :visualization_settings "{}"
                      :parameters "[]"
                      :created_at #t "2024-05-02T19:26:15Z"}
        metric2-dataset-query {:type "query"
                               :database 1
                               :query {:source-table 5
                                       :aggregation [["avg" ["field" 31 nil]]]}}
        metric2-card {:description "basic description (Migrated from metric 1.)"
                      :id 22
                      :archived false
                      :table_id 5
                      :enable_embedding false
                      :query_type "query"
                      :name "orders total average"
                      :type "metric"
                      :creator_id 1
                      :dataset_query (json/generate-string metric2-dataset-query)
                      :parameter_mappings "[]"
                      :display "line"
                      :visualization_settings "{}"
                      :parameters "[]"
                      :created_at #t "2024-05-02T19:26:15Z"}
        dataset-query {:type "query"
                       :database 1
                       :query {:source-table 5
                               :aggregation [["/" ["metric" 2] ["metric" 1]] ["count"]]
                               :filter ["<" ["field" 33 nil] 100]}}
        card {:description "query description"
              :archived true
              :table_id 5
              :enable_embedding true
              :query_type "query"
              :name "v1 metric consuming query"
              :type "question"
              :creator_id 2
              :dataset_query (json/generate-string dataset-query)
              :parameter_mappings "[{}]"
              :display "table"
              :visualization_settings "{}"
              :parameters "[3]"
              :created_at #t "2024-05-02T19:26:15Z"}
        rewritten-dataset-query (-> dataset-query
                                    (assoc-in [:query :aggregation 0 1 1] 22)
                                    (assoc-in [:query :aggregation 0 2 1] 11))
        rewritten-card {:description "query description"
                        :archived true
                        :table_id 5
                        :enable_embedding true
                        :query_type "query"
                        :name "v1 metric consuming query"
                        :type "question"
                        :creator_id 2
                        :dataset_query rewritten-dataset-query
                        :parameter_mappings "[{}]"
                        :display "table"
                        :visualization_settings "{}"
                        :parameters "[3]"
                        :created_at #t "2024-05-02T19:26:15Z"}]
    (is (= rewritten-card
           (-> (#'metrics-v2/rewrite-metric-consuming-card card {1 metric1-card
                                                                 2 metric2-card})
               (update :dataset_query json/parse-string true))))))
