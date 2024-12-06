(ns metabase.db.custom-migrations.metrics-v2-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [malli.error :as me]
   [metabase.db.custom-migrations.metrics-v2 :as metrics-v2]
   [metabase.db.schema-migrations-test.impl :as impl]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest ^:mb/once convert-metric-v2-test
  (testing "basic metric"
    (let [metric-definition {:source-table 5
                             :aggregation [["sum" ["field" 41 nil]]]
                             :filter ["=" ["field" 35 nil] 3]}
          metric-v1 {:description "basic description"
                     :archived false
                     :table_id 5
                     :definition (json/encode metric-definition)
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
                     :display "scalar"
                     :visualization_settings "{}"
                     :parameters "[]"
                     :created_at #t "2024-05-02T19:26:15.490874Z"}]
      (is (= metric-v2 (-> (#'metrics-v2/convert-metric-v2 metric-v1 1)
                           (update :dataset_query json/decode+kw)))))))

(deftest ^:mb/once rewrite-single-metric-consuming-card-test
  (doseq [metric-tag ["metric" "METRIC" "meTriC"]]
    (testing (str "with source-table key " metric-tag)
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
                         :dataset_query (json/encode metric-dataset-query)
                         :parameter_mappings "[]"
                         :display "line"
                         :visualization_settings "{}"
                         :parameters "[]"
                         :created_at #t "2024-05-02T19:26:15Z"}
            dataset-query {:type "query"
                           :database 1
                           :query {:source-table 5
                                   :aggregation [["count"] [metric-tag 1]]
                                   :filter ["<" ["field" 33 nil] 100]}}
            rewritten-dataset-query (assoc-in dataset-query [:query :aggregation 1 1] 11)]
        (is (= rewritten-dataset-query
               (-> (#'metrics-v2/rewrite-metric-consuming-card (json/encode dataset-query)
                                                               {1 (:id metric-card)})
                   json/decode+kw)))))))

(deftest ^:mb/once rewrite-multi-metric-consuming-card-test
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
                      :dataset_query (json/encode metric1-dataset-query)
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
                      :dataset_query (json/encode metric2-dataset-query)
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
        rewritten-dataset-query (-> dataset-query
                                    (assoc-in [:query :aggregation 0 1 1] 22)
                                    (assoc-in [:query :aggregation 0 2 1] 11))]
    (is (= rewritten-dataset-query
           (-> (#'metrics-v2/rewrite-metric-consuming-card (json/encode dataset-query)
                                                           {1 (:id metric1-card)
                                                            2 (:id metric2-card)})
               json/decode+kw)))))

(def query-validator
  (mr/validator mbql.s/MBQLQuery))

(def query-explainer
  (mr/explainer mbql.s/MBQLQuery))

(deftest migrate-metrics-to-v2-test
  (impl/test-migrations ["v51.2024-05-13T15:30:57" "v51.2024-05-13T16:00:00"] [migrate!]
    (let [add-timestamps (fn [entity]
                           (assoc entity
                                  :created_at (Instant/now)
                                  :updated_at (Instant/now)))
          user-id (t2/insert-returning-pk! :core_user
                                           {:first_name  "Howard"
                                            :last_name   "Hughes"
                                            :email       "howard@aircraft.com"
                                            :password    "superstrong"
                                            :date_joined :%now})
          database-id (t2/insert-returning-pk! :metabase_database
                                               {:name       "DB"
                                                :engine     "h2"
                                                :created_at :%now
                                                :updated_at :%now
                                                :details    "{}"})
          table-id (t2/insert-returning-pk! :metabase_table
                                            (add-timestamps
                                             {:name "orders"
                                              :active true
                                              :db_id database-id}))
          [field1-id field2-id] (t2/insert-returning-pks! :metabase_field
                                                          (map add-timestamps
                                                               [{:name "total"
                                                                 :base_type "type/Float"
                                                                 :table_id table-id
                                                                 :database_type "DOUBLE PRECISION"}
                                                                {:name "tax"
                                                                 :base_type "type/Float"
                                                                 :table_id table-id
                                                                 :database_type "DOUBLE PRECISION"}]))
          metric-definition {:source-table table-id
                             :aggregation [["sum" ["field" field1-id nil]]]
                             :filter ["=" ["field" field2-id nil] 3]}
          metric-v1 (add-timestamps
                     {:description "metric description"
                      :archived false
                      :table_id table-id
                      :definition (json/encode metric-definition)
                      :name "orders 3 tax subtotal sum"
                      :creator_id user-id})
          metric-id (t2/insert-returning-pk! :metric metric-v1)
          dataset-query {:type "query"
                         :database database-id
                         :query {:source-table table-id
                                 :aggregation [["count"] ["meTric" metric-id]]
                                 :filter [">" ["field" field1-id nil] 30]}}
          card (add-timestamps
                {:description "card description"
                 :database_id database-id
                 :table_id table-id
                 :query_type "query"
                 :name "orders 3 tax subtotal sum"
                 :type "metric"
                 :creator_id user-id
                 :dataset_query (json/encode dataset-query)
                 :display "line"
                 :visualization_settings "{}"})
          card-id (t2/insert-returning-pk! :report_card card)
          original-query (:dataset_query card)
          normalized-query #(-> %
                                json/decode+kw
                                mbql.normalize/normalize
                                :query)]
      (testing "sanity"
        (is (t2/exists? :metric))
        (let [query (normalized-query original-query)]
          (is (query-validator query)
              (me/humanize (query-explainer query)))))

      (testing "forward migration"
        (migrate!)
        (let [migration-coll (t2/select-one :collection :name "Migrated Metrics v1")
              coll-permissions (t2/select :permissions :object [:like (str "/collection/" (:id migration-coll) "/%")])
              metric-cards (t2/select :report_card :collection_id (:id migration-coll))
              rewritten-card (t2/select-one :report_card card-id)
              rewritten-query (-> rewritten-card :dataset_query normalized-query)]
          (is (= 1 (count metric-cards)))
          (is (int? card-id))
          (is (=? [{:object        (str "/collection/" (:id migration-coll) "/read/")
                    :group_id      1
                    :collection_id (:id migration-coll)
                    :perm_type     "perms/collection-access"
                    :perm_value    "read"}]
                  coll-permissions))
          (is (= original-query (:dataset_query_metrics_v2_migration_backup rewritten-card)))
          (is (query-validator rewritten-query))
          (is (= (-> metric-cards first :id) (get-in rewritten-query [:aggregation 1 1])))))

      (testing "rollback"
        (migrate! :down 50)
        (let [migtation-coll (t2/select-one :collection :name "Migrated Metrics v1")
              reverted-card (t2/select-one :report_card card-id)]
          (is (nil? migtation-coll))
          (is (= original-query (:dataset_query reverted-card))))))))
