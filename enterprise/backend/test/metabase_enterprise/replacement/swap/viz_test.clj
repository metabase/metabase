(ns metabase-enterprise.replacement.swap.viz-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase-enterprise.replacement.swap.viz :as swap.viz]
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
                (source-swap/do-swap! [:card (:id child)]
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
                (source-swap/do-swap! [:card (:id child)]
                                      [:card (:id old-source)]
                                      [:card (:id new-source)])
                (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)]
                  (is (= {:some_setting "value"} (select-keys updated-viz [:some_setting]))
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
                (source-swap/do-swap! [:card (:id child)]
                                      [:card (:id old-source)]
                                      [:card (:id new-source)])
                (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)
                      updated-cs  (:column_settings updated-viz)]
                  (is (contains? updated-cs name-key)
                      "Name-based column settings key should be preserved")
                  (is (= {:column_title "Custom"} (get updated-cs name-key))
                      "Name-based column settings value should be preserved"))))))))))

;;; ----------------------------------------- Series card parameter mapping swap ------------------------------------------

(deftest swap-source-series-card-updates-dashcard-params-test
  (testing "dashboard-card-update-field-refs! updates parameter_mappings on dashcards where the card is a series card"
    (mt/dataset source-swap
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-series-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [;; primary card queries products_a
                  primary-card (card/create-card! (card-with-query "Primary card" :products_a) user)
                  ;; series card also queries products_a
                  series-card  (card/create-card! (card-with-query "Series card" :products_a) user)]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Series Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id       dashboard-id
                              :card_id            (:id primary-card)
                              :parameter_mappings [{:parameter_id "series-param"
                                                    :card_id      (:id series-card)
                                                    :target       [:dimension [:field (mt/id :products_a :id) nil]]}]}
                             :model/DashboardCardSeries _
                             {:dashboardcard_id dashcard-id
                              :card_id          (:id series-card)
                              :position         0}]
                ;; Swap products_a → products_b on the series card
                (swap.viz/dashboard-card-update-field-refs!
                 (:id series-card)
                 {:type :table, :id (mt/id :products_a)}
                 {:type :table, :id (mt/id :products_b)})
                ;; The dashcard's parameter_mappings should now reference products_b field name
                (let [updated-dc (t2/select-one :model/DashboardCard :id dashcard-id)
                      target     (get-in updated-dc [:parameter_mappings 0 :target])
                      field-ref  (second target)]
                  ;; After swap, field refs become name-based
                  (is (= "ID" (second field-ref))
                      "Parameter mapping target on series-card dashcard should reference products_b field")
                  (is (not= [:dimension [:field (mt/id :products_a :id) nil]] target)
                      "Parameter mapping should no longer reference the old products_a field"))))))))))

(deftest swap-source-series-card-no-duplicate-updates-test
  (testing "dashboard-card-update-field-refs! deduplicates when card is both primary and series"
    (mt/dataset source-swap
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-series-dedup@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [card (card/create-card! (card-with-query "Both card" :products_a) user)]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dedup Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id       dashboard-id
                              :card_id            (:id card)
                              :parameter_mappings [{:parameter_id "my-param"
                                                    :card_id      (:id card)
                                                    :target       [:dimension [:field (mt/id :products_a :id) nil]]}]}
                             ;; Also add as series card on the same dashcard
                             :model/DashboardCardSeries _
                             {:dashboardcard_id dashcard-id
                              :card_id          (:id card)
                              :position         0}]
                (swap.viz/dashboard-card-update-field-refs!
                 (:id card)
                 {:type :table, :id (mt/id :products_a)}
                 {:type :table, :id (mt/id :products_b)})
                ;; Should update exactly once, not error
                (let [updated-dc (t2/select-one :model/DashboardCard :id dashcard-id)
                      target     (get-in updated-dc [:parameter_mappings 0 :target])
                      field-ref  (second target)]
                  (is (= "ID" (second field-ref))
                      "Parameter mapping should be updated to name-based ref")
                  (is (not= [:dimension [:field (mt/id :products_a :id) nil]] target)
                      "Parameter mapping should no longer reference the old field"))))))))))
