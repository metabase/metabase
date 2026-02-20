(ns metabase-enterprise.replacement.swap.viz-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- card-with-query
  "Create a card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn- card-sourced-from
  "Create a card map whose query sources `inner-card`."
  [card-name inner-card]
  (let [mp        (mt/metadata-provider)
        card-meta (lib.metadata/card mp (:id inner-card))]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp card-meta)
     :visualization_settings {}}))

;;; ----------------------------------------- DashboardCard column_settings upgrade ------------------------------------------

(def vis-settings {:column_settings
                   {"[\"name\",\"name\"]"
                    {:click_behavior
                     {:parameterMapping
                      ;; yes, this really is a keyword in the data that comes back
                      {(keyword (pr-str "[\"dimension\",[\"field\",37,{\"base-type\":\"type{:Text\",\"source-field\":25}],{\"stage-number\":0}]"))
                       {:source
                        {:type "column", :id "name", :name "name"},

                        :target
                        {:type "dimension",
                         :id
                         "[\"dimension\",[\"field\",37,{\"base-type\":\"type/Text\",\"source-field\":25}],{\"stage-number\":0}]",
                         :dimension
                         ["dimension"
                          [:field 37 {:base-type :type/Text, :source-field 25}]
                          {:stage-number 0}]},
                        :id
                        "[\"dimension\",[\"field\",37,{\"base-type\":\"type/Text\",\"source-field\":25}],{\"stage-number\":0}]"}},
                      :targetId 7048,
                      :linkType "question",
                      :type "link"}}}})

(deftest swap-source-card-to-card-updates-dashcard-column-settings-test
  (testing "swap-source card -> card: DashboardCard column_settings keys are upgraded"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-dashcard-cs@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id dashboard-id
                              :card_id (:id child)
                              :visualization_settings vis-settings}]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:card (:id old-source)]
                                   [:card (:id new-source)])
                ;; TODO (eric): Add assertions
                ))))))))

(deftest swap-source-no-column-settings-test
  (testing "swap-source: DashboardCards without column_settings are unaffected"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-dashcard-no-cs@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id dashboard-id
                              :card_id (:id child)
                              :visualization_settings {:some_setting "value"}}]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:card (:id old-source)]
                                   [:card (:id new-source)])
                (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)]
                  (is (= {:some_setting "value"} updated-viz)
                      "Visualization settings without column_settings should be unchanged"))))))))))

(deftest swap-source-name-based-column-settings-keys-preserved-test
  (testing "swap-source: name-based column_settings keys are not modified"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-dashcard-name-cs@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)
                  name-key   (json/encode ["name" "MyColumn"])]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id dashboard-id
                              :card_id (:id child)
                              :visualization_settings {:column_settings {name-key {:column_title "Custom"}}}}]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/swap! [:card (:id child)]
                                   [:card (:id old-source)]
                                   [:card (:id new-source)])
                (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)
                      updated-cs  (:column_settings updated-viz)]
                  (is (contains? updated-cs name-key)
                      "Name-based column settings key should be preserved")
                  (is (= {:column_title "Custom"} (get updated-cs name-key))
                      "Name-based column settings value should be preserved"))))))))))
