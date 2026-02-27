(ns metabase-enterprise.replacement.source-swap-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.field-refs :as field-refs]
   [metabase-enterprise.replacement.runner :as runner]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase-enterprise.replacement.test-util :as test-util]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- native-card-with-query
  "Create a native card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM " (name table-kw) " LIMIT 1"))
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

;;; ------------------------------------------------ swap-native-card-source! ------------------------------------------------

(deftest swap-native-card-source!-updates-query-test
  (testing "Card referencing the old card gets its query text and template tags updated"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}}")}]
          (source-swap/do-swap! [:card card-id] [:card 999] [:card 888])
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)
                tags          (lib/template-tags updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (not (str/includes? query "{{#999}}")))
            (is (contains? tags "#888"))
            (is (not (contains? tags "#999")))
            (is (= 888 (get-in tags ["#888" :card-id])))
            (is (= "#888" (get-in tags ["#888" :name])))
            (is (= "#888" (get-in tags ["#888" :display-name])))))))))

(deftest swap-native-card-source!-no-op-test
  (testing "Card NOT referencing the old card is unchanged"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#777}}")}]
          (let [before (t2/select-one :model/Card :id card-id)]
            (source-swap/do-swap! [:card card-id] [:card 999] [:card 888])
            (let [after (t2/select-one :model/Card :id card-id)]
              (is (= (:dataset_query before) (:dataset_query after))))))))))

(deftest swap-native-card-source!-updates-dependencies-test
  (testing "Dependencies are updated after swap"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp       (mt/metadata-provider)
              products (lib.metadata/table mp (mt/id :products))
              orders   (lib.metadata/table mp (mt/id :orders))]
          (mt/with-temp [:model/Card {old-source-id :id} {:dataset_query (lib/query mp products)}
                         :model/Card {new-source-id :id} {:dataset_query (lib/query mp orders)}
                         :model/Card {native-card-id :id :as native-card}
                         {:dataset_query (lib/native-query mp (str "SELECT * FROM {{#" old-source-id "}}"))}]
            ;; Perform the swap
            (source-swap/do-swap! [:card native-card-id] [:card old-source-id] [:card new-source-id])
            ;; FIXME
            (is (contains? (set (usages/direct-usages [:card new-source-id]))
                           [:card native-card-id]))))))))

;;; ------------------------------------------------ swap-source: card -> X ------------------------------------------------

(deftest swap-source-card-to-card-test
  (testing "swap-source card -> card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  new-source (card/create-card! (test-util/card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (source-swap/do-swap! [:card (:id child)]
                                    [:card (:id old-source)]
                                    [:card (:id new-source)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id new-source) (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-card-to-table-test
  (testing "swap-source card -> table: child card's source changes to source-table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/do-swap! [:card (:id child)]
                                    [:card (:id old-source)]
                                    [:table (mt/id :products)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (mt/id :products) (get-in updated-query [:stages 0 :source-table])))
                (is (nil? (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-card-to-native-card-test
  (testing "swap-source card -> native card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source  (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  native-card (card/create-card! (native-card-with-query "Native target" :products) user)
                  _           (test-util/wait-for-result-metadata (:id native-card))
                  child       (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/do-swap! [:card (:id child)]
                                    [:card (:id old-source)]
                                    [:card (:id native-card)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id native-card) (get-in updated-query [:stages 0 :source-card])))))))))))

;;; ------------------------------------------------ swap-source: native card -> X ------------------------------------------------

(deftest swap-source-native-card-to-card-test
  (testing "swap-source native card -> card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-native-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [native-card (card/create-card! (native-card-with-query "Native source" :products) user)
                  _           (test-util/wait-for-result-metadata (:id native-card))
                  new-source  (card/create-card! (test-util/card-with-query "New source" :products) user)
                  child       (card/create-card! (card-sourced-from "Child card" native-card) user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/do-swap! [:card (:id child)]
                                    [:card (:id native-card)]
                                    [:card (:id new-source)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id new-source) (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-native-card-to-native-card-test
  (testing "swap-source native card -> native card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-native-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-native (card/create-card! (native-card-with-query "Old native" :products) user)
                  _          (test-util/wait-for-result-metadata (:id old-native))
                  new-native (card/create-card! (native-card-with-query "New native" :products) user)
                  _          (test-util/wait-for-result-metadata (:id new-native))
                  child      (card/create-card! (card-sourced-from "Child card" old-native) user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/do-swap! [:card (:id child)]
                                    [:card (:id old-native)]
                                    [:card (:id new-native)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id new-native) (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-native-card-to-table-test
  (testing "swap-source native card -> table: child card's source changes to source-table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-native-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [native-card (card/create-card! (native-card-with-query "Native source" :products) user)
                  _           (test-util/wait-for-result-metadata (:id native-card))
                  child       (card/create-card! (card-sourced-from "Child card" native-card) user)]
              (field-refs/upgrade! [:card (:id child)])
              (source-swap/do-swap! [:card (:id child)]
                                    [:card (:id native-card)]
                                    [:table (mt/id :products)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (mt/id :products) (get-in updated-query [:stages 0 :source-table])))
                (is (nil? (get-in updated-query [:stages 0 :source-card])))))))))))

;;; ------------------------------------------------ swap-source: table -> X ------------------------------------------------

(deftest swap-source-table-to-card-test
  (testing "swap-source table -> card: child card's source changes to source-card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (test-util/with-restored-card-queries
              (let [new-source (card/create-card! (test-util/card-with-query "New source" :products) user)
                    child      (card/create-card! (test-util/card-with-query "Child card" :products) user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/do-swap! [:card (:id child)]
                                      [:table (mt/id :products)]
                                      [:card (:id new-source)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                  (is (= (:id new-source) (get-in updated-query [:stages 0 :source-card])))
                  (is (nil? (get-in updated-query [:stages 0 :source-table]))))))))))))

(deftest swap-source-table-to-table-test
  (testing "swap-source table -> table: child card's source-table is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (test-util/with-restored-card-queries
              (let [child (card/create-card! (test-util/card-with-query "Child card" :products) user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/do-swap! [:card (:id child)]
                                      [:table (mt/id :products)]
                                      [:table (mt/id :products)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                  (is (= (mt/id :products) (get-in updated-query [:stages 0 :source-table]))))))))))))

(deftest swap-source-table-to-native-card-test
  (testing "swap-source table -> native card: child card's source changes to source-card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (test-util/with-restored-card-queries
              (let [native-card (card/create-card! (native-card-with-query "Native target" :products) user)
                    _           (test-util/wait-for-result-metadata (:id native-card))
                    child       (card/create-card! (test-util/card-with-query "Child card" :products) user)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/do-swap! [:card (:id child)]
                                      [:table (mt/id :products)]
                                      [:card (:id native-card)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                  (is (= (:id native-card) (get-in updated-query [:stages 0 :source-card])))
                  (is (nil? (get-in updated-query [:stages 0 :source-table]))))))))))))

;;; ------------------------------------------------ swap-source: transforms ------------------------------------------------

(defn- transform-sourced-from-card
  "Create a Transform map whose query sources `inner-card`."
  [transform-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:source {:type "query"
              :query (lib/query mp (lib.metadata/card mp (:id inner-card)))}
     :name   transform-name
     :target {:database (mt/id) :table transform-name}}))

(defn- transform-sourced-from-table
  "Create a Transform map whose query sources a table."
  [transform-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:source {:type "query"
              :query (lib/query mp (lib.metadata/table mp (mt/id table-kw)))}
     :name   transform-name
     :target {:database (mt/id) :table transform-name}}))

(deftest swap-source-card-to-card-with-transform-test
  (testing "swap-source card -> card: transform's source query is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-card-transform@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  new-source (card/create-card! (test-util/card-with-query "New source" :products) user)]
              (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-card "test_transform_c2c" old-source)]
                (field-refs/upgrade! [:transform transform-id])
                (source-swap/do-swap! [:transform transform-id]
                                      [:card (:id old-source)]
                                      [:card (:id new-source)])
                (let [updated-source (t2/select-one-fn :source :model/Transform :id transform-id)]
                  (is (= (:id new-source) (get-in updated-source [:query :stages 0 :source-card]))))))))))))

(deftest swap-source-table-to-card-with-transform-test
  (testing "swap-source table -> card: transform's source query changes to source-card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-card-transform@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (test-util/with-restored-card-queries
              (let [new-source (card/create-card! (test-util/card-with-query "New source" :products) user)]
                (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-table "test_transform_t2c" :products)]
                  (field-refs/upgrade! [:transform transform-id])
                  (source-swap/do-swap! [:transform transform-id]
                                        [:table (mt/id :products)]
                                        [:card (:id new-source)])
                  (let [updated-source (t2/select-one-fn :source :model/Transform :id transform-id)]
                    (is (= (:id new-source) (get-in updated-source [:query :stages 0 :source-card])))
                    (is (nil? (get-in updated-source [:query :stages 0 :source-table])))))))))))))

(deftest swap-source-card-to-table-with-transform-test
  (testing "swap-source card -> table: transform's source query changes to source-table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-table-transform@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)]
              (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-card "test_transform_c2t" old-source)]
                (field-refs/upgrade! [:transform transform-id])
                (source-swap/do-swap! [:transform transform-id]
                                      [:card (:id old-source)]
                                      [:table (mt/id :products)])
                (let [updated-source (t2/select-one-fn :source :model/Transform :id transform-id)]
                  (is (= (mt/id :products) (get-in updated-source [:query :stages 0 :source-table])))
                  (is (nil? (get-in updated-source [:query :stages 0 :source-card]))))))))))))

(deftest swap-source-card-to-card-with-card-and-transform-test
  (testing "swap-source card -> card: both child card and transform are updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-card-both@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  new-source (card/create-card! (test-util/card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-card "test_transform_both" old-source)]
                (field-refs/upgrade! [:card (:id child)])
                (source-swap/do-swap! [:card (:id child)]
                                      [:card (:id old-source)]
                                      [:card (:id new-source)])
                (field-refs/upgrade! [:transform transform-id])
                (source-swap/do-swap! [:transform transform-id]
                                      [:card (:id old-source)]
                                      [:card (:id new-source)])
                (let [updated-card-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      updated-source     (t2/select-one-fn :source :model/Transform :id transform-id)]
                  (is (= (:id new-source) (get-in updated-card-query [:stages 0 :source-card]))
                      "Child card's source-card should be updated")
                  (is (= (:id new-source) (get-in updated-source [:query :stages 0 :source-card]))
                      "Transform's source query source-card should be updated"))))))))))

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
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  new-source (card/create-card! (test-util/card-with-query "New source" :products) user)
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
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  new-source (card/create-card! (test-util/card-with-query "New source" :products) user)
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
                  (is (=? {:some_setting "value"} updated-viz)
                      "Visualization settings without column_settings should be unchanged"))))))))))

(deftest swap-source-name-based-column-settings-keys-preserved-test
  (testing "swap-source: name-based column_settings keys are not modified"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-dashcard-name-cs@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (test-util/card-with-query "Old source" :products) user)
                  new-source (card/create-card! (test-util/card-with-query "New source" :products) user)
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

;;; ------------------------------------------------ Mixed Chain Tests ------------------------------------------------
;;; These tests cover chains that mix MBQL and native queries

(deftest swap-source-mixed-chain-test
  (testing "swap-source propagates through: MBQL Model → Native Card → MBQL Card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-mixed-chain@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [ ;; Chain: old-model → native-card ({{#id}}) → mbql-card (source-card)
                  old-model   (card/create-card! (test-util/card-with-query "Old Model" :products) user)
                  new-model   (card/create-card! (test-util/card-with-query "New Model" :products) user)
                  _           (test-util/wait-for-result-metadata (:id old-model))
                  native-card (card/create-card! (test-util/native-card-sourced-from "Native Card" old-model) user)
                  _           (test-util/wait-for-result-metadata (:id native-card))
                  mbql-card   (card/create-card! (card-sourced-from "MBQL Card" native-card) user)]
              ;; Swap the model at the root
              (field-refs/upgrade! [:card (:id native-card)])
              (field-refs/upgrade! [:card (:id mbql-card)])
              (source-swap/do-swap! [:card (:id native-card)]
                                    [:card (:id old-model)]
                                    [:card (:id new-model)])
              (source-swap/do-swap! [:card (:id mbql-card)]
                                    [:card (:id old-model)]
                                    [:card (:id new-model)])
              ;; Native card's {{#old-id}} should be updated to {{#new-id}}
              (let [native-query (t2/select-one-fn :dataset_query :model/Card :id (:id native-card))
                    native-sql   (get-in native-query [:stages 0 :native])]
                (is (str/includes? native-sql (str "{{#" (:id new-model) "}}"))
                    "Native card should reference new model")
                (is (not (str/includes? native-sql (str "{{#" (:id old-model) "}}")))
                    "Native card should not reference old model"))
              ;; MBQL card should still reference native-card (unchanged, it's not a direct dependent)
              (let [mbql-query (t2/select-one-fn :dataset_query :model/Card :id (:id mbql-card))]
                (is (= (:id native-card) (get-in mbql-query [:stages 0 :source-card]))
                    "MBQL card should still reference native card (unchanged)")))))))))

;; swap! on cards

(deftest source-swap-card-table-table-test
  (mt/with-premium-features #{:dependencies}
    (mt/dataset source-swap
      (testing "Card on table swaps with new table"
        (let [mp (mt/metadata-provider)
              query (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))]
          (doseq [[message query] [["Simple query"
                                    query]
                                   ["Query with fields"
                                    (-> query
                                        (lib/with-fields [(lib.metadata/field mp (mt/id :orders_a :total))]))]
                                   ["Query with filter"
                                    (-> query
                                        (lib/filter (lib/< 2 (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                   ["Query with expression"
                                    (-> query
                                        (lib/expression "PLUS" (lib/+ 2  (lib.metadata/field mp (mt/id :orders_a :id)))))]
                                   ["Query with aggregate"
                                    (-> query
                                        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                   ["Query with breakout"
                                    (-> query
                                        (lib/breakout (lib.metadata/field mp (mt/id :orders_a :total))))]
                                   ["Query with join"
                                    (-> query
                                        (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products_a))
                                                                   [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                                           (lib.metadata/field mp (mt/id :products_a :id)))])))]]]
            (testing message
              (mt/with-temp [:model/Card card {:dataset_query query}]
                ;; first, upgrade the card
                (field-refs/upgrade! [:card (:id card)])
                ;; sanity check that card points to original table
                (is (= (mt/id :orders_a) (-> card :table_id)))
                (is (= (mt/id :orders_a) (-> card :dataset_query :stages (get 0) :source-table)))
                (let [old-source [:table (mt/id :orders_a)]
                      new-source [:table (mt/id :orders_c)]
                      results (qp/process-query (:dataset_query card))]
                  (source-swap/do-swap! [:card (:id card)]
                                        old-source
                                        new-source)
                  (let [card' (t2/select-one :model/Card (:id card))
                        results' (qp/process-query (:dataset_query card'))]
                    (is (= (mt/id :orders_c) (-> card' :table_id)))
                    (is (= (mt/id :orders_c) (-> card' :dataset_query :stages (get 0) :source-table)))
                    (is (not= (mt/rows+column-names results)
                              (mt/rows+column-names results')))))))))))))

(deftest source-swap-card-table-card-test
  (mt/with-premium-features #{:dependencies}
    (mt/dataset source-swap
      (let [mp (mt/metadata-provider)
            query (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))]
        (doseq [[message query] [["Simple query"
                                  query]
                                 ["Query with fields"
                                  (-> query
                                      (lib/with-fields [(lib.metadata/field mp (mt/id :orders_a :total))]))]
                                 ["Query with filter"
                                  (-> query
                                      (lib/filter (lib/< 2 (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                 ["Query with expression"
                                  (-> query
                                      (lib/expression "PLUS" (lib/+ 2  (lib.metadata/field mp (mt/id :orders_a :id)))))]
                                 ["Query with aggregate"
                                  (-> query
                                      (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                 ["Query with breakout"
                                  (-> query
                                      (lib/breakout (lib.metadata/field mp (mt/id :orders_a :total))))]
                                 ["Query with join"
                                  (-> query
                                      (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products_a))
                                                                 [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                                         (lib.metadata/field mp (mt/id :products_a :id)))])))]]]
          (testing message
            (mt/with-temp [:model/Card card {:dataset_query query}
                           :model/Card new-source {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders_c)))}]
              ;; first, upgrade the card
              (field-refs/upgrade! [:card (:id card)])
              ;; sanity check that card points to original table
              (is (= (mt/id :orders_a) (-> card :table_id)))
              (is (= (mt/id :orders_a) (-> card :dataset_query :stages (get 0) :source-table)))
              (let [results (qp/process-query (:dataset_query card))]
                (source-swap/do-swap! [:card (:id card)]
                                      [:table (mt/id :orders_a)]
                                      [:card (:id new-source)])
                (let [card' (t2/select-one :model/Card (:id card))
                      results' (qp/process-query (:dataset_query card'))]
                  (is (= (mt/id :orders_c) (-> card' :table_id)))
                  (is (nil? (-> card' :dataset_query :stages (get 0) :source-table)))
                  (is (= (:id new-source) (-> card' :dataset_query :stages (get 0) :source-card)))
                  (is (not= (mt/rows+column-names results)
                            (mt/rows+column-names results'))))))))))))

(deftest source-swap-card-card-card-test
  (mt/with-premium-features #{:dependencies}
    (mt/dataset source-swap
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card old-source {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))}]
          (let [query (lib/query mp (lib.metadata/card mp (:id old-source)))]
            (doseq [[message query] [["Simple query"
                                      query]
                                     ["Query with fields"
                                      (-> query
                                          (lib/with-fields [(lib.metadata/field mp (mt/id :orders_a :total))]))]
                                     ["Query with filter"
                                      (-> query
                                          (lib/filter (lib/< 2 (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                     ["Query with expression"
                                      (-> query
                                          (lib/expression "PLUS" (lib/+ 2  (lib.metadata/field mp (mt/id :orders_a :id)))))]
                                     ["Query with aggregate"
                                      (-> query
                                          (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                     ["Query with breakout"
                                      (-> query
                                          (lib/breakout (lib.metadata/field mp (mt/id :orders_a :total))))]
                                     ["Query with join"
                                      (-> query
                                          (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products_a))
                                                                     [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                                             (lib.metadata/field mp (mt/id :products_a :id)))])))]]]
              (testing message
                (mt/with-temp [:model/Card card {:dataset_query query}
                               :model/Card new-source {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders_c)))}]
                  ;; first, upgrade the card
                  (field-refs/upgrade! [:card (:id card)])
                  ;; sanity check that card points to original table
                  (is (= (mt/id :orders_a) (-> card :table_id)))
                  (is (= (:id old-source) (-> card :dataset_query :stages (get 0) :source-card)))
                  (let [results (qp/process-query (:dataset_query card))]
                    (source-swap/do-swap! [:card (:id card)]
                                          [:card (:id old-source)]
                                          [:card (:id new-source)])
                    (let [card' (t2/select-one :model/Card (:id card))
                          results' (qp/process-query (:dataset_query card'))]
                      (is (= (mt/id :orders_c) (-> card' :table_id)))
                      (is (nil? (-> card' :dataset_query :stages (get 0) :source-table)))
                      (is (= (:id new-source) (-> card' :dataset_query :stages (get 0) :source-card)))
                      (is (not= (mt/rows+column-names results)
                                (mt/rows+column-names results'))))))))))))))

(deftest source-swap-card-card-table-test
  (mt/with-premium-features #{:dependencies}
    (mt/dataset source-swap
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card old-source {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))}]
          (let [query (lib/query mp (lib.metadata/card mp (:id old-source)))]
            (doseq [[message query] [["Simple query"
                                      query]
                                     ["Query with fields"
                                      (-> query
                                          (lib/with-fields [(lib.metadata/field mp (mt/id :orders_a :total))]))]
                                     ["Query with filter"
                                      (-> query
                                          (lib/filter (lib/< 2 (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                     ["Query with expression"
                                      (-> query
                                          (lib/expression "PLUS" (lib/+ 2  (lib.metadata/field mp (mt/id :orders_a :id)))))]
                                     ["Query with aggregate"
                                      (-> query
                                          (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders_a :total)))))]
                                     ["Query with breakout"
                                      (-> query
                                          (lib/breakout (lib.metadata/field mp (mt/id :orders_a :total))))]
                                     ["Query with join"
                                      (-> query
                                          (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products_a))
                                                                     [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                                             (lib.metadata/field mp (mt/id :products_a :id)))])))]]]
              (testing message
                (mt/with-temp [:model/Card card {:dataset_query query}]
                  ;; first, upgrade the card
                  (field-refs/upgrade! [:card (:id card)])
                  ;; sanity check that card points to original card
                  (is (= (mt/id :orders_a) (-> card :table_id)))
                  (is (= (:id old-source) (-> card :dataset_query :stages (get 0) :source-card)))
                  (let [results (qp/process-query (:dataset_query card))]
                    (source-swap/do-swap! [:card (:id card)]
                                          [:card (:id old-source)]
                                          [:table (mt/id :orders_c)])
                    (let [card' (t2/select-one :model/Card (:id card))
                          results' (qp/process-query (:dataset_query card'))]
                      (is (= (mt/id :orders_c) (-> card' :table_id)))
                      (is (= (mt/id :orders_c) (-> card' :dataset_query :stages (get 0) :source-table)))
                      (is (nil? (-> card' :dataset_query :stages (get 0) :source-card)))
                      (is (not= (mt/rows+column-names results)
                                (mt/rows+column-names results'))))))))))))))

(deftest source-swap-card-join-test
  (mt/with-premium-features #{:dependencies}
    (mt/dataset source-swap
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card old-card {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products_a)))}
                       :model/Card new-card {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products_c)))}]
          (let [query (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))]
            (doseq [[message query old-source new-source]
                    [["join with table, swap table to table"
                      (-> query
                          (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products_a))
                                                     [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                             (lib.metadata/field mp (mt/id :products_a :id)))])))
                      [:table (mt/id :products_a)]
                      [:table (mt/id :products_c)]]

                     ["join with table, swap table to card"
                      (-> query
                          (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products_a))
                                                     [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                             (lib.metadata/field mp (mt/id :products_a :id)))])))
                      [:table (mt/id :products_a)]
                      [:card  (:id new-card)]]

                     ["join with card, swap card to card"
                      (-> query
                          (lib/join (lib/join-clause (lib.metadata/card mp (:id old-card))
                                                     [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                             (lib.metadata/field mp (mt/id :products_a :id)))])))
                      [:card (:id old-card)]
                      [:card (:id new-card)]]

                     ["join with card, swap card to table"
                      (-> query
                          (lib/join (lib/join-clause (lib.metadata/card mp (:id old-card))
                                                     [(lib/= (lib.metadata/field mp (mt/id :orders_a :product_id))
                                                             (lib.metadata/field mp (mt/id :products_a :id)))])))
                      [:card (:id old-card)]
                      [:table (mt/id :products_c)]]]]
              (testing message
                (mt/with-temp [:model/Card card {:dataset_query query}]
                  ;; first, upgrade the card
                  (field-refs/upgrade! [:card (:id card)])
                  (try
                    (let [results (qp/process-query (:dataset_query card))]
                      (source-swap/do-swap! [:card (:id card)]
                                            old-source
                                            new-source)
                      (let [card' (t2/select-one :model/Card (:id card))
                            results' (qp/process-query (:dataset_query card'))]
                        (is (not= (mt/rows+column-names results)
                                  (mt/rows+column-names results')))))
                    (catch Exception e
                      (is (nil? (.getMessage e)))
                      (is (= [] (:dataset_query card))))))))))))))

(deftest segment-swap-test
  (mt/with-premium-features #{:dependencies}
    (mt/dataset source-swap
      (mt/with-test-user :crowberto
        (let [selector (fn [q] (-> q :stages (get 0) :filters first last))
              mp (mt/metadata-provider)]
          (mt/with-temp [:model/Segment segment
                         {:table_id (mt/id :orders_a)
                          :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))
                                          (lib/filter (lib/< 2 (lib.metadata/field mp (mt/id :orders_a :id)))))}]
            (events/publish-event! :event/segment-create {:object segment :user-id (mt/user->id :crowberto)})
            (is (lib/field-ref-id (selector (:definition segment))))
            ;; sanity check that dependencies works
            (is (contains? (set (usages/transitive-usages [:table (mt/id :orders_a)]))
                           [:segment (:id segment)]))
            (is (not (contains? (set (usages/transitive-usages [:table (mt/id :orders_b)]))
                                [:segment (:id segment)])))
            (field-refs/upgrade! [:segment (:id segment)])
            (source-swap/do-swap! [:segment (:id segment)]
                                  [:table (mt/id :orders_a)]
                                  [:table (mt/id :orders_b)])
            (let [segment' (t2/select-one :model/Segment (:id segment))]
              (is (lib/field-ref-name (selector (:definition segment'))))
              (is (= (mt/id :orders_b) (:table_id segment')))
              (is (= (mt/id :orders_b) (-> segment' :definition :stages (get 0) :source-table)))
              (is (not (contains? (set (usages/transitive-usages [:table (mt/id :orders_a)]))
                                  [:segment (:id segment)])))
              (is (contains? (set (usages/transitive-usages [:table (mt/id :orders_b)]))
                             [:segment (:id segment)])))))))))

(deftest measure-swap-test
  (mt/with-premium-features #{:dependencies}
    (mt/dataset source-swap
      (mt/with-test-user :crowberto
        (let [selector (fn [q] (-> q :stages (get 0) :aggregation first last))
              mp (mt/metadata-provider)]
          (mt/with-temp [:model/Measure measure
                         {:table_id (mt/id :orders_a)
                          :definition (-> (lib/query mp (lib.metadata/table mp (mt/id :orders_a)))
                                          (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders_a :id)))))}]
            (events/publish-event! :event/measure-create {:object measure :user-id (mt/user->id :crowberto)})
            (is (lib/field-ref-id (selector (:definition measure))))
            ;; sanity check that dependencies works
            (is (contains? (set (usages/transitive-usages [:table (mt/id :orders_a)]))
                           [:measure (:id measure)]))
            (is (not (contains? (set (usages/transitive-usages [:table (mt/id :orders_b)]))
                                [:measure (:id measure)])))
            (field-refs/upgrade! [:measure (:id measure)])
            (source-swap/do-swap! [:measure (:id measure)]
                                  [:table (mt/id :orders_a)]
                                  [:table (mt/id :orders_b)])
            (let [measure' (t2/select-one :model/Measure (:id measure))]
              (is (lib/field-ref-name (selector (:definition measure'))))
              (is (= (mt/id :orders_b) (:table_id measure')))
              (is (= (mt/id :orders_b) (-> measure' :definition :stages (get 0) :source-table)))
              (is (not (contains? (set (usages/transitive-usages [:table (mt/id :orders_a)]))
                                  [:measure (:id measure)])))
              (is (contains? (set (usages/transitive-usages [:table (mt/id :orders_b)]))
                             [:measure (:id measure)])))))))))

;;; ---------------------------------------- Runner: second-level dashboard tests ----------------------------------------

(deftest run-swap-table-to-table-updates-second-level-dashboard-params-test
  (testing "table→table swap via runner: dashboard parameter mappings on cards using the old table are remapped"
    (mt/dataset source-swap
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "run-swap-dash-params@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [card (card/create-card! (test-util/card-with-query "Products A card" :products_a) user)]
              (field-refs/upgrade! [:card (:id card)])
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id       dashboard-id
                              :card_id            (:id card)
                              :parameter_mappings [{:parameter_id "my-param"
                                                    :card_id      (:id card)
                                                    :target       [:dimension [:field (mt/id :products_a :id) nil]]}]}]
                (runner/run-swap [:table (mt/id :products_a)] [:table (mt/id :products_b)])
                ;; Card's source-table should be updated
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id card))]
                  (is (= (mt/id :products_b) (get-in updated-query [:stages 0 :source-table]))))
                ;; DashboardCard parameter mapping should reference products_b field, not products_a
                (let [updated-dc (t2/select-one :model/DashboardCard :id dashcard-id)
                      target     (get-in updated-dc [:parameter_mappings 0 :target])]
                  (is (= [:dimension [:field (mt/id :products_b :id) nil]] target)
                      "Parameter mapping target should be remapped to the products_b field"))))))))))

(deftest run-swap-series-card-updates-dashboard-params-test
  (testing "table→table swap via runner: parameter_mappings targeting a series card are updated"
    (mt/dataset source-swap
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "run-swap-series@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [;; primary card queries products_a (this is a direct dependent of the table)
                  primary-card (card/create-card! (test-util/card-with-query "Primary card" :products_a) user)
                  ;; series card also queries products_a
                  series-card  (card/create-card! (test-util/card-with-query "Series card" :products_a) user)]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Series Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id       dashboard-id
                              :card_id            (:id primary-card)
                              :parameter_mappings [{:parameter_id "primary-param"
                                                    :card_id      (:id primary-card)
                                                    :target       [:dimension [:field (mt/id :products_a :id) nil]]}
                                                   {:parameter_id "series-param"
                                                    :card_id      (:id series-card)
                                                    :target       [:dimension [:field (mt/id :products_a :id) nil]]}]}
                             :model/DashboardCardSeries _
                             {:dashboardcard_id dashcard-id
                              :card_id          (:id series-card)
                              :position         0}]
                (runner/run-swap [:table (mt/id :products_a)] [:table (mt/id :products_b)])
                ;; Both cards' source-tables should be updated
                (is (= (mt/id :products_b)
                       (get-in (t2/select-one-fn :dataset_query :model/Card :id (:id primary-card))
                               [:stages 0 :source-table])))
                (is (= (mt/id :products_b)
                       (get-in (t2/select-one-fn :dataset_query :model/Card :id (:id series-card))
                               [:stages 0 :source-table])))
                ;; Both parameter mappings should no longer reference products_a
                (let [updated-dc     (t2/select-one :model/DashboardCard :id dashcard-id)
                      targets        (mapv :target (:parameter_mappings updated-dc))
                      old-target     [:dimension [:field (mt/id :products_a :id) nil]]]
                  (is (= 2 (count targets)))
                  (is (not= old-target (first targets))
                      "Primary card parameter mapping should no longer reference products_a")
                  (is (not= old-target (second targets))
                      "Series card parameter mapping should no longer reference products_a"))))))))))
