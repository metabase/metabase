(ns metabase-enterprise.replacement.field-refs-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.replacement.field-refs :as replacement.field-refs]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- field-id-ref
  [mp field-id]
  (-> (lib.metadata/field mp field-id) lib/ref lib/->legacy-MBQL))

(defn- dimension-field-id-ref
  ([mp field-id]
   [:dimension (field-id-ref mp field-id)])
  ([mp field-id stage-number]
   [:dimension (field-id-ref mp field-id) {:stage-number stage-number}]))

;;; ------------------------------------------------ Card --------------------------------------------------------

(deftest card-upgrade-field-refs!-query-test
  (testing "should upgrade refs in a query"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count))
                    (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                    lib/append-stage
                    (lib/filter (lib/= (lib.metadata/field mp (mt/id :orders :id)) 1)))]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:dataset_query
                 {:stages [{:source-table (mt/id :orders)
                            :aggregation [[:count {}]]
                            :breakout [[:field {} (mt/id :orders :id)]]}
                           {:filters [[:= {} [:field {} "ID"] 1]]}]}}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-viz-settings-test
  (testing "should upgrade refs in viz settings"
    (let [mp           (mt/metadata-provider)
          query        (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/count))
                           (lib/aggregate (lib/count))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :created_at))))
          id-ref       (field-id-ref mp (mt/id :orders :id))
          created-ref  (field-id-ref mp (mt/id :orders :created_at))
          viz-settings {:column_settings
                        {(json/encode ["ref" id-ref])
                         {:column_title "Order ID"}

                         (json/encode ["ref" created-ref])
                         {:column_title "Created"}}

                        :table.column_formatting
                        [{:columns [id-ref]
                          :value   10}
                         {:columns [created-ref]
                          :value   "1970-01-01"}]

                        :pivot_table.column_split
                        {:rows    [id-ref]
                         :columns [created-ref]
                         :values  [[:aggregation 0] [:aggregation 1]]}

                        :pivot_table.collapsed_rows
                        {:rows  [id-ref]
                         :value [10]}}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                :visualization_settings viz-settings}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:visualization_settings
                 {:column_settings
                  {(json/encode ["name" "ID"])         {:column_title "Order ID"}
                   (json/encode ["name" "CREATED_AT"]) {:column_title "Created"}}

                  :table.column_formatting
                  [{:columns ["ID"]
                    :value 10}
                   {:columns ["CREATED_AT"]
                    :value "1970-01-01"}]

                  :pivot_table.column_split
                  {:rows    ["ID"]
                   :columns ["CREATED_AT"]
                   :values  ["count" "count_2"]}

                  :pivot_table.collapsed_rows
                  {:rows  ["ID"]
                   :value [10]}}}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-viz-settings-broken-test
  (testing "should ignore refs in viz settings that cannot be resolved"
    (let [mp           (mt/metadata-provider)
          query        (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/count))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                           (lib/breakout (lib.metadata/field mp (mt/id :orders :created_at))))
          viz-settings {:pivot_table.column_split
                        {:rows    [(field-id-ref mp (mt/id :orders :id))]
                         :columns [[:field 9999 nil]]
                         :values  [[:aggregation 0] [:aggregation 1]]}}]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                :visualization_settings viz-settings}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:visualization_settings
                 {:pivot_table.column_split
                  {:rows    ["ID"]
                   :columns [[:field 9999 nil]]
                   :values  ["count" [:aggregation 1]]}}}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-parameters-test
  (testing "should upgrade refs in `:values_source_config` of parameters"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card {card1-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                     :model/Card {card2-id :id} {:dataset_query (-> (lib/native-query mp "SELECT 1")
                                                                    (lib/with-native-query "SELECT * FROM products WHERE category = {{category}}"))
                                                 :parameters [{:id   "test-param"
                                                               :name "category"
                                                               :type :string/=
                                                               :target [:dimension [:template-tag "category"]]
                                                               :values_source_type "card"
                                                               :values_source_config
                                                               {:card_id card1-id
                                                                :value_field (field-id-ref mp (mt/id :products :category))}}]}]
        (replacement.field-refs/upgrade-field-refs! [:card card2-id])
        (is (=? {:parameters [{:name "category"
                               :values_source_config {:card_id card1-id
                                                      :value_field [:field "CATEGORY" {}]}}]}
                (t2/select-one :model/Card card2-id)))))))

(deftest card-upgrade-field-refs!-native-query-test
  (testing "should not change a card with a native query"
    (let [mp    (mt/metadata-provider)
          query (lib/native-query mp "SELECT * FROM orders")]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:dataset_query {:stages [{:native "SELECT * FROM orders"}]}}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-broken-query-test
  (testing "should not crash on a card with a broken query"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "SELECT 1")}]
        ;; simulate a broken query by updating the dataset_query directly
        (t2/update! :model/Card card-id {:dataset_query {}})
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:dataset_query {}}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-broken-source-card-test
  (testing "should not crash when a parameter references a card with a broken query"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card {broken-card-id :id} {:dataset_query (lib/native-query mp "SELECT 1")}
                     :model/Card {card-id :id}        {:dataset_query (lib/native-query mp "SELECT 1")
                                                       :parameters [{:id   "test-param"
                                                                     :name "category"
                                                                     :type :string/=
                                                                     :values_source_type "card"
                                                                     :values_source_config
                                                                     {:card_id broken-card-id
                                                                      :value_field [:field 1 nil]}}]}]
        ;; simulate a broken source card
        (t2/update! :model/Card broken-card-id {:dataset_query {}})
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:parameters [{:name "category"
                               :values_source_config {:card_id broken-card-id
                                                      :value_field [:field 1 nil]}}]}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-nonexistent-source-card-test
  (testing "should not crash when a parameter references a non-existent card"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card {source-card-id :id} {:dataset_query (lib/native-query mp "SELECT 1")}
                     :model/Card {card-id :id}        {:dataset_query (lib/native-query mp "SELECT 1")
                                                       :parameters [{:id   "test-param"
                                                                     :name "category"
                                                                     :type :string/=
                                                                     :values_source_type "card"
                                                                     :values_source_config
                                                                     {:card_id source-card-id
                                                                      :value_field [:field 1 nil]}}]}]
        ;; delete the source card to simulate a non-existent reference
        (t2/delete! :model/Card source-card-id)
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (=? {:parameters [{:name "category"
                               :values_source_config {:card_id source-card-id
                                                      :value_field [:field 1 nil]}}]}
                (t2/select-one :model/Card card-id)))))))

(deftest card-upgrade-field-refs!-no-changes-test
  (testing "should not update a card when there are no changes"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Card {card-id :id, updated-at :updated_at} {:dataset_query query}]
        (replacement.field-refs/upgrade-field-refs! [:card card-id])
        (is (= updated-at (:updated_at (t2/select-one :model/Card card-id))))))))

;;; ------------------------------------------------ Transform --------------------------------------------------------

(deftest transform-upgrade-field-refs!-mbql-query-test
  (testing "should upgrade refs in a transform with an mbql query"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                    lib/append-stage
                    (lib/filter (lib/= (lib.metadata/field mp (mt/id :orders :id)) 1)))]
      (mt/with-temp [:model/Transform {transform-id :id} {:name   "test transform"
                                                          :source {:type "query" :query query}
                                                          :target {:database (mt/id) :table "out"}}]
        (replacement.field-refs/upgrade-field-refs! [:transform transform-id])
        (is (=? {:source {:type  :query
                          :query {:stages [{:source-table (mt/id :orders)
                                            :breakout [[:field {} (mt/id :orders :id)]]}
                                           {:filters [[:= {} [:field {} "ID"] 1]]}]}}}
                (t2/select-one :model/Transform transform-id)))))))

(deftest transform-upgrade-field-refs!-native-query-test
  (testing "should not change a transform with a native query"
    (let [mp    (mt/metadata-provider)
          query (lib/native-query mp "SELECT * FROM orders")]
      (mt/with-temp [:model/Transform {transform-id :id} {:name   "test transform"
                                                          :source {:type "query" :query query}
                                                          :target {:database (mt/id) :table "out"}}]
        (is (nil? (replacement.field-refs/upgrade-field-refs! [:transform transform-id])))))))

(deftest transform-upgrade-field-refs!-broken-query-test
  (testing "should not crash on a transform with a broken query"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Transform {transform-id :id} {:name   "test transform"
                                                          :source {:type "query" :query (lib/native-query mp "SELECT 1")}
                                                          :target {:database (mt/id) :table "out"}}]
        ;; simulate a broken query by updating source directly in the DB
        (t2/query-one {:update :transform
                       :set    {:source "{\"type\":\"query\",\"query\":{}}"}
                       :where  [:= :id transform-id]})
        (is (nil? (replacement.field-refs/upgrade-field-refs! [:transform transform-id])))))))

(deftest transform-upgrade-field-refs!-no-changes-test
  (testing "should not update a transform when there are no changes"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Transform {transform-id :id, updated-at :updated_at} {:name   "test transform"
                                                                                  :source {:type "query" :query query}
                                                                                  :target {:database (mt/id) :table "out"}}]
        (replacement.field-refs/upgrade-field-refs! [:transform transform-id])
        (is (= updated-at (:updated_at (t2/select-one :model/Transform transform-id))))))))

;;; ------------------------------------------------- Segment ----------------------------------------------------------

(deftest segment-upgrade-field-refs!-mbql-query-test
  (testing "should handle a segment with a valid mbql query without error"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/filter (lib/> (lib.metadata/field mp (mt/id :orders :id)) 10)))]
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :orders)
                                                      :definition query}]
        (is (nil? (replacement.field-refs/upgrade-field-refs! [:segment segment-id])))))))

(deftest segment-upgrade-field-refs!-broken-query-test
  (testing "should not crash on a segment with a broken definition"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/filter (lib/> (lib.metadata/field mp (mt/id :orders :id)) 10)))]
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :orders)
                                                      :definition query}]
        (t2/query-one {:update :segment
                       :set    {:definition "{}"}
                       :where  [:= :id segment-id]})
        (is (nil? (replacement.field-refs/upgrade-field-refs! [:segment segment-id])))))))

(deftest segment-upgrade-field-refs!-no-changes-test
  (testing "should not update a segment when there are no changes"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/filter (lib/> (lib.metadata/field mp (mt/id :orders :id)) 10)))]
      (mt/with-temp [:model/Segment {segment-id :id, updated-at :updated_at} {:table_id   (mt/id :orders)
                                                                              :definition query}]
        (replacement.field-refs/upgrade-field-refs! [:segment segment-id])
        (is (= updated-at (:updated_at (t2/select-one :model/Segment segment-id))))))))

;;; ------------------------------------------------- Measure ----------------------------------------------------------

(deftest measure-upgrade-field-refs!-mbql-query-test
  (testing "should handle a measure with a valid mbql query without error"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :id)))))]
      (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :orders)
                                                      :name       "test measure"
                                                      :definition query}]
        (is (nil? (replacement.field-refs/upgrade-field-refs! [:measure measure-id])))))))

(deftest measure-upgrade-field-refs!-broken-query-test
  (testing "should not crash on a measure with a broken definition"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :orders)
                                                      :name       "test measure"
                                                      :definition query}]
        (t2/query-one {:update :measure
                       :set    {:definition "{}"}
                       :where  [:= :id measure-id]})
        (is (nil? (replacement.field-refs/upgrade-field-refs! [:measure measure-id])))))))

(deftest measure-upgrade-field-refs!-no-changes-test
  (testing "should not update a measure when there are no changes"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :id)))))]
      (mt/with-temp [:model/Measure {measure-id :id, updated-at :updated_at} {:table_id   (mt/id :orders)
                                                                              :name       "test measure"
                                                                              :definition query}]
        (replacement.field-refs/upgrade-field-refs! [:measure measure-id])
        (is (= updated-at (:updated_at (t2/select-one :model/Measure measure-id))))))))

;;; ------------------------------------------------ Dashboard --------------------------------------------------------

(deftest dashboard-upgrade-field-refs!-parameters-test
  (testing "should upgrade refs in dashboard parameters with values_source_config"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card      {card-id :id}      {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                     :model/Dashboard {dashboard-id :id} {:parameters [{:id   "test-param"
                                                                        :name "category"
                                                                        :type :string/=
                                                                        :values_source_type "card"
                                                                        :values_source_config
                                                                        {:card_id     card-id
                                                                         :value_field (field-id-ref mp (mt/id :products :category))}}]}]
        (replacement.field-refs/upgrade-field-refs! [:dashboard dashboard-id])
        (is (=? {:parameters [{:name "category"
                               :values_source_config {:card_id     card-id
                                                      :value_field [:field "CATEGORY" {}]}}]}
                (t2/select-one :model/Dashboard dashboard-id)))))))

(deftest dashboard-upgrade-field-refs!-parameter-mappings-test
  (testing "should upgrade refs in dashcard parameter mappings"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                    lib/append-stage)]
      (mt/with-temp [:model/Card          {card-id :id}      {:dataset_query query}
                     :model/Dashboard     {dashboard-id :id} {}
                     :model/DashboardCard {dashcard-id :id}  {:dashboard_id       dashboard-id
                                                              :card_id            card-id
                                                              :parameter_mappings [{:parameter_id "my-param"
                                                                                    :card_id      card-id
                                                                                    :target       (dimension-field-id-ref mp (mt/id :orders :id) 1)}]}]
        (replacement.field-refs/upgrade-field-refs! [:dashboard dashboard-id])
        (is (=? {:parameter_mappings [{:parameter_id "my-param"
                                       :card_id      card-id
                                       :target       [:dimension [:field "ID" {}] {:stage-number 1}]}]}
                (t2/select-one :model/DashboardCard dashcard-id)))))))

(deftest dashboard-upgrade-field-refs!-broken-source-card-test
  (testing "should not crash when a dashcard references a card with a broken query"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card          {card-id :id}      {:dataset_query (lib/native-query mp "SELECT 1")}
                     :model/Dashboard     {dashboard-id :id} {}
                     :model/DashboardCard {dashcard-id :id}  {:dashboard_id       dashboard-id
                                                              :card_id            card-id
                                                              :parameter_mappings [{:parameter_id "my-param"
                                                                                    :card_id      card-id
                                                                                    :target       (dimension-field-id-ref mp (mt/id :orders :id))}]}]
        ;; simulate a broken card
        (t2/update! :model/Card card-id {:dataset_query {}})
        (replacement.field-refs/upgrade-field-refs! [:dashboard dashboard-id])
        (is (=? {:parameter_mappings [{:target (dimension-field-id-ref mp (mt/id :orders :id))}]}
                (t2/select-one :model/DashboardCard dashcard-id)))))))

(defn- make-click-behavior
  [card-id target]
  {:type    "link"
   :linkType "question"
   :targetId card-id
   :parameterMapping
   {(json/encode target)
    {:id     (json/encode target)
     :source {:type :column
              :id   "ID"
              :name "ID"}
     :target {:type      :dimension
              :id        (json/encode target)
              :dimension target}}}})

(deftest dashboard-upgrade-field-refs!-click-behaviors-test
  (testing "should upgrade refs in click behavior parameter mappings (both global and per-column)"
    (let [mp            (mt/metadata-provider)
          source-query  (lib/query mp (lib.metadata/table mp (mt/id :products)))
          target-query  (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                            (lib/breakout (lib.metadata/field mp (mt/id :orders :id)))
                            lib/append-stage)
          target        (dimension-field-id-ref mp (mt/id :orders :id) 1)]
      (mt/with-temp [:model/Card          {source-card-id :id} {:dataset_query source-query}
                     :model/Card          {target-card-id :id} {:dataset_query target-query}
                     :model/Dashboard     {dashboard-id :id} {}
                     :model/DashboardCard {dashcard-id :id}
                     {:dashboard_id  dashboard-id
                      :card_id       source-card-id
                      :visualization_settings
                      {:click_behavior  (make-click-behavior target-card-id target)
                       :column_settings
                       {(json/encode [:name "ID"])
                        {:click_behavior (make-click-behavior target-card-id target)}}}}]
        (replacement.field-refs/upgrade-field-refs! [:dashboard dashboard-id])
        (let [viz     (:visualization_settings (t2/select-one :model/DashboardCard dashcard-id))
              viz-key (keyword (json/encode target))]
          (testing "global click behavior dimension should be upgraded"
            (is (=? {:click_behavior
                     {:targetId target-card-id
                      :parameterMapping
                      {viz-key {:target {:dimension ["dimension" [:field "ID" {}] {:stage-number 1}]}}}}}
                    viz)))
          (testing "per-column click behavior dimension should be upgraded"
            (is (=? {:column_settings
                     {(json/encode [:name "ID"])
                      {:click_behavior
                       {:targetId target-card-id
                        :parameterMapping
                        {viz-key {:target {:dimension ["dimension" [:field "ID" {}] {:stage-number 1}]}}}}}}}
                    viz))))))))

(deftest dashboard-upgrade-field-refs!-no-changes-test
  (testing "should not update a dashboard or dashcards when there are no changes"
    (let [mp    (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Card          {card-id :id}                            {:dataset_query query}
                     :model/Dashboard     {dashboard-id :id, dash-updated :updated_at} {}
                     :model/DashboardCard {dashcard-id :id, dc-updated :updated_at}
                     {:dashboard_id       dashboard-id
                      :card_id            card-id
                      :parameter_mappings [{:parameter_id "my-param"
                                            :card_id      card-id
                                            :target       (dimension-field-id-ref mp (mt/id :orders :id))}]}]
        (replacement.field-refs/upgrade-field-refs! [:dashboard dashboard-id])
        (is (= dash-updated (:updated_at (t2/select-one :model/Dashboard dashboard-id))))
        (is (= dc-updated (:updated_at (t2/select-one :model/DashboardCard dashcard-id))))))))
