(ns metabase-enterprise.replacement.source-swap-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.field-refs :as replacement.field-refs]
   [metabase-enterprise.replacement.source-swap :as replacement.source-swap]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment
  metabase-enterprise.dependencies.events/keep-me)

;;; ------------------------------------------------ Card --------------------------------------------------------

(deftest card-swap-source!-source-table-test
  (testing "swap-source! should update source-table and table_id when swapping tables"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query query
                                                    :table_id      (mt/id :orders)}]
            (replacement.field-refs/upgrade-field-refs! [:card card-id])
            (replacement.source-swap/swap-source! [:card card-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (let [card (t2/select-one :model/Card card-id)]
              (is (= (mt/id :reviews) (:table_id card)))
              (is (= (mt/id :reviews)
                     (get-in card [:dataset_query :stages 0 :source-table]))))))))))

(deftest card-swap-source!-source-card-test
  (testing "swap-source! should update source-card when swapping card sources"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Card {old-source-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                         :model/Card {new-source-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :reviews)))}
                         :model/Card {card-id :id}       {:dataset_query {:lib/type :mbql/query
                                                                          :database (mt/id)
                                                                          :stages   [{:lib/type    :mbql.stage/mbql
                                                                                      :source-card old-source-id}]}}]
            (replacement.field-refs/upgrade-field-refs! [:card card-id])
            (replacement.source-swap/swap-source! [:card card-id]
                                                  [:card old-source-id]
                                                  [:card new-source-id])
            (is (= new-source-id
                   (get-in (t2/select-one :model/Card card-id)
                           [:dataset_query :stages 0 :source-card])))))))))

(deftest card-swap-source!-native-query-test
  (testing "swap-source! should replace table name in native SQL"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (lib/native-query mp "SELECT ID FROM ORDERS")]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query query}]
            (replacement.field-refs/upgrade-field-refs! [:card card-id])
            (replacement.source-swap/swap-source! [:card card-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (is (= "SELECT ID FROM PUBLIC.REVIEWS"
                   (get-in (t2/select-one :model/Card card-id)
                           [:dataset_query :stages 0 :native])))))))))

(deftest card-swap-source!-native-query-preserves-result-metadata-test
  (testing "swap-source! should preserve `:result_metadata` for native queries"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp              (mt/metadata-provider)
              query           (lib/native-query mp "SELECT ID FROM ORDERS")
              result-metadata [{:name "ID" :base_type :type/Integer}]]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query   query
                                                    :result_metadata result-metadata}]
            (replacement.field-refs/upgrade-field-refs! [:card card-id])
            (replacement.source-swap/swap-source! [:card card-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (let [card (t2/select-one :model/Card card-id)]
              (is (= "SELECT ID FROM PUBLIC.REVIEWS"
                     (get-in card [:dataset_query :stages 0 :native])))
              (is (=? [{:name "ID" :base_type :type/Integer}]
                      (:result_metadata card))))))))))

(deftest card-swap-source!-broken-query-test
  (testing "swap-source! should not crash on a card with a broken query"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "SELECT 1")}]
            (t2/update! :model/Card card-id {:dataset_query {}})
            (replacement.source-swap/swap-source! [:card card-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (is (= {} (:dataset_query (t2/select-one :model/Card card-id))))))))))

;;; ------------------------------------------------ Transform --------------------------------------------------------

(deftest transform-swap-source!-source-table-test
  (testing "swap-source! should update source-table in transform query"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
          (mt/with-temp [:model/Transform {transform-id :id} {:name   "test transform"
                                                              :source {:type "query" :query query}
                                                              :target {:database (mt/id) :table "out"}}]
            (replacement.field-refs/upgrade-field-refs! [:transform transform-id])
            (replacement.source-swap/swap-source! [:transform transform-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (is (= (mt/id :reviews)
                   (get-in (t2/select-one :model/Transform transform-id)
                           [:source :query :stages 0 :source-table])))))))))

(deftest transform-swap-source!-broken-query-test
  (testing "swap-source! should not crash on a transform with a broken query"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Transform {transform-id :id} {:name   "test transform"
                                                              :source {:type  "query"
                                                                       :query (lib/native-query mp "SELECT 1")}
                                                              :target {:database (mt/id) :table "out"}}]
            (t2/query-one {:update :transform
                           :set    {:source "{\"type\":\"query\",\"query\":{}}"}
                           :where  [:= :id transform-id]})
            (is (nil? (replacement.source-swap/swap-source! [:transform transform-id]
                                                            [:table (mt/id :orders)]
                                                            [:table (mt/id :reviews)])))))))))

;;; ------------------------------------------------- Segment ----------------------------------------------------------

(deftest segment-swap-source!-source-table-test
  (testing "swap-source! should update source-table and table_id in segment definition"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        (lib/filter (lib/> (lib.metadata/field mp (mt/id :orders :id)) 10)))]
          (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :orders)
                                                          :definition query}]
            (replacement.field-refs/upgrade-field-refs! [:segment segment-id])
            (replacement.source-swap/swap-source! [:segment segment-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (let [segment (t2/select-one :model/Segment segment-id)]
              (is (= (mt/id :reviews) (:table_id segment)))
              (is (= (mt/id :reviews)
                     (get-in segment [:definition :stages 0 :source-table]))))))))))

(deftest segment-swap-source!-broken-query-test
  (testing "swap-source! should not crash on a segment with a broken definition"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        (lib/filter (lib/> (lib.metadata/field mp (mt/id :orders :id)) 10)))]
          (mt/with-temp [:model/Segment {segment-id :id} {:table_id   (mt/id :orders)
                                                          :definition query}]
            (t2/query-one {:update :segment
                           :set    {:definition "{}"}
                           :where  [:= :id segment-id]})
            (is (nil? (replacement.source-swap/swap-source! [:segment segment-id]
                                                            [:table (mt/id :orders)]
                                                            [:table (mt/id :reviews)])))))))))

;;; ------------------------------------------------- Measure ----------------------------------------------------------

(deftest measure-swap-source!-source-table-test
  (testing "swap-source! should update source-table and table_id in measure definition"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :id)))))]
          (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :orders)
                                                          :name       "test measure"
                                                          :definition query}]
            (replacement.field-refs/upgrade-field-refs! [:measure measure-id])
            (replacement.source-swap/swap-source! [:measure measure-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (let [measure (t2/select-one :model/Measure measure-id)]
              (is (= (mt/id :reviews) (:table_id measure)))
              (is (= (mt/id :reviews)
                     (get-in measure [:definition :stages 0 :source-table]))))))))))

(deftest measure-swap-source!-broken-query-test
  (testing "swap-source! should not crash on a measure with a broken definition"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        (lib/aggregate (lib/count)))]
          (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :orders)
                                                          :name       "test measure"
                                                          :definition query}]
            (t2/query-one {:update :measure
                           :set    {:definition "{}"}
                           :where  [:= :id measure-id]})
            (is (nil? (replacement.source-swap/swap-source! [:measure measure-id]
                                                            [:table (mt/id :orders)]
                                                            [:table (mt/id :reviews)])))))))))

;;; ------------------------------------------------ Dashboard --------------------------------------------------------

(deftest dashboard-swap-source!-parameter-card-id-test
  (testing "swap-source! should update card_id in dashboard parameter values_source_config"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp (mt/metadata-provider)]
          (mt/with-temp [:model/Card      {old-card-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                         :model/Card      {new-card-id :id} {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :reviews)))}
                         :model/Dashboard {dashboard-id :id}
                         {:parameters [{:id                   "test-param"
                                        :name                 "category"
                                        :type                 :string/=
                                        :values_source_type   "card"
                                        :values_source_config {:card_id     old-card-id
                                                               :value_field [:field "ID" {:base-type :type/Integer}]}}]}]
            (replacement.source-swap/swap-source! [:dashboard dashboard-id]
                                                  [:card old-card-id]
                                                  [:card new-card-id])
            (is (= new-card-id
                   (-> (t2/select-one :model/Dashboard dashboard-id)
                       :parameters first :values_source_config :card_id)))))))))

(deftest dashboard-swap-source!-parameter-mappings-card-to-card-test
  (testing "swap-source! should walk parameter mapping targets without corruption during card-to-card swap"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp    (mt/metadata-provider)
              query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        (lib/breakout (lib.metadata/field mp (mt/id :orders :id))))]
          (mt/with-temp [:model/Card          {old-card-id :id}  {:dataset_query query}
                         :model/Card          {new-card-id :id}  {:dataset_query query}
                         :model/Dashboard     {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id}
                         {:dashboard_id       dashboard-id
                          :card_id            old-card-id
                          :parameter_mappings [{:parameter_id "my-param"
                                                :card_id      old-card-id
                                                :target       [:dimension
                                                               [:field "ID" {:base-type :type/Integer}]]}]}]
            (replacement.source-swap/swap-source! [:dashboard dashboard-id]
                                                  [:card old-card-id]
                                                  [:card new-card-id])
            (let [dashcard (t2/select-one :model/DashboardCard dashcard-id)]
              (is (=? {:parameter_mappings [{:parameter_id "my-param"
                                             :card_id      old-card-id
                                             :target       [:dimension [:field (mt/id :orders :id) {}]]}]}
                      dashcard)))))))))

(deftest dashboard-swap-source!-parameter-mappings-implicit-join-test
  (testing "swap-source! should update :source-field in implicitly joined parameter targets"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp           (mt/metadata-provider)
              query        (lib/query mp (lib.metadata/table mp (mt/id :orders)))
              category-col (m/find-first #(= "CATEGORY" (:name %)) (lib/filterable-columns query))
              target       [:dimension (lib/->legacy-MBQL (lib/ref category-col))]]
          (mt/with-temp [:model/Card          {card-id :id}      {:dataset_query query}
                         :model/Dashboard     {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id}
                         {:dashboard_id       dashboard-id
                          :card_id            card-id
                          :parameter_mappings [{:parameter_id "cat-param"
                                                :card_id      card-id
                                                :target       target}]}]
            (replacement.field-refs/upgrade-field-refs! [:dashboard dashboard-id])
            (replacement.source-swap/swap-source! [:dashboard dashboard-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (let [updated-target (get-in (t2/select-one :model/DashboardCard dashcard-id)
                                         [:parameter_mappings 0 :target])]
              (is (=? [:dimension [:field (mt/id :products :category)
                                   {:source-field (mt/id :reviews :product_id)}]]
                      updated-target)))))))))

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

(deftest dashboard-swap-source!-click-behavior-implicit-join-test
  (testing "swap-source! should update :source-field in click behavior dimension targets"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp            (mt/metadata-provider)
              target-query  (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                (lib/breakout (lib.metadata/field mp (mt/id :orders :id))))
              source-query  (lib/query mp (lib.metadata/table mp (mt/id :products)))
              category-col  (m/find-first #(= "CATEGORY" (:name %)) (lib/filterable-columns target-query))
              target        [:dimension (lib/->legacy-MBQL (lib/ref category-col))]]
          (mt/with-temp [:model/Card          {target-card-id :id} {:dataset_query target-query}
                         :model/Card          {source-card-id :id} {:dataset_query source-query}
                         :model/Dashboard     {dashboard-id :id}   {}
                         :model/DashboardCard {dashcard-id :id}
                         {:dashboard_id           dashboard-id
                          :card_id                source-card-id
                          :visualization_settings {:click_behavior (make-click-behavior target-card-id target)}}]
            (replacement.field-refs/upgrade-field-refs! [:dashboard dashboard-id])
            (replacement.source-swap/swap-source! [:dashboard dashboard-id]
                                                  [:table (mt/id :orders)]
                                                  [:table (mt/id :reviews)])
            (let [viz     (:visualization_settings (t2/select-one :model/DashboardCard dashcard-id))
                  viz-key (keyword (json/encode target))]
              (is (=? {:click_behavior
                       {:targetId target-card-id
                        :parameterMapping
                        {viz-key
                         {:target {:dimension ["dimension"
                                               [:field (mt/id :products :category)
                                                {:source-field (mt/id :reviews :product_id)}]]}}}}}
                      viz)))))))))
