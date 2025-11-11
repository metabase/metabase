(ns metabase-enterprise.representations.v0.dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.dashboard :as v0-dashboard]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest export-dashboard-test
  (testing "Exporting a dashboard produces valid representation"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Test Collection"}
                   :model/Card {card-id :id} {:type :question
                                              :dataset_query (lib/native-query (mt/metadata-provider) "select 1")}
                   :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"
                                                        :collection_id collection-id
                                                        :parameters []}
                   :model/DashboardCard {_dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id card-id
                                                            :row 0
                                                            :col 0
                                                            :size_x 4
                                                            :size_y 4}]
      (let [exported (export/export-entity (t2/select-one :model/Dashboard :id dashboard-id))]
        (testing "has required fields"
          (is (= :dashboard (:type exported)))
          (is (= :v0 (:version exported)))
          (is (= "Test Dashboard" (:display_name exported)))
          (is (some? (:name exported))))

        (testing "includes dashcards"
          (is (seq (:dashcards exported)))
          (is (= 1 (count (:dashcards exported)))))

        (testing "dashcard has card reference"
          (let [dashcard (first (:dashcards exported))
                card-ref (:card_id dashcard)]
            (is (some? card-ref))
            (is (string? card-ref))
            (is (re-matches #"ref:question-\d+" card-ref))))))))

(deftest export-import-dashboard-roundtrip-test
  (testing "Export then import roundtrip for dashboard"
    (mt/with-temp [:model/Collection {collection-id :id} {:name "Dashboard Collection"}
                   :model/Card {card-id :id} {:type :question
                                              :dataset_query (lib/native-query (mt/metadata-provider) "select 1")}
                   :model/Dashboard {dashboard-id :id}
                   {:name "My Dashboard"
                    :collection_id collection-id
                    :parameters []
                    :description "A test dashboard"}
                   :model/DashboardCard {dashcard-id :id}
                   {:dashboard_id dashboard-id
                    :card_id card-id
                    :row 0
                    :col 0
                    :size_x 4
                    :size_y 4}]
      (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)
            dashboard-edn (export/export-entity dashboard)
            dashboard-yaml (rep-yaml/generate-string dashboard-edn)
            dashboard-rep (rep-yaml/parse-string dashboard-yaml)
            collection (t2/select-one :model/Collection :id collection-id)
            card (t2/select-one :model/Card :id card-id)
            ref-index (v0-common/map-entity-index
                       {(v0-common/unref (v0-common/->ref collection-id :collection))
                        collection
                        (v0-common/unref (v0-common/->ref card-id :question))
                        card})

            ;; Persist the imported dashboard
            _ (import/update! dashboard-rep dashboard-id ref-index)
            imported-dashboard (t2/select-one :model/Dashboard :id dashboard-id)

            ;; Export again and compare
            edn2 (export/export-entity imported-dashboard)
            yaml2 (rep-yaml/generate-string edn2)
            rep2 (rep-yaml/parse-string yaml2)]

        (testing "roundtrip preserves dashboard name"
          (is (= "My Dashboard" (:display_name rep2))))

        (testing "roundtrip preserves dashboard type"
          (is (= "dashboard" (name (:type rep2)))))

        (testing "roundtrip preserves dashcards"
          (is (seq (:dashcards rep2)))
          (is (= 1 (count (:dashcards rep2)))))))))

(deftest representation-type-test
  (testing "representation-type multimethod returns :dashboard"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Type Test Dashboard"
                                                        :parameters []}]
      (let [dashboard (t2/select-one :model/Dashboard :id dashboard-id)]
        (is (= :dashboard (v0-common/representation-type dashboard)))))))

(deftest dashboard-with-tabs-test
  (testing "Dashboard with tabs exports and imports correctly"
    (mt/with-temp [:model/Card {card-id :id} {:type :question
                                              :dataset_query (lib/native-query (mt/metadata-provider) "select 1")}
                   :model/Dashboard {dashboard-id :id} {:name "Tabbed Dashboard"
                                                        :parameters []}
                   :model/DashboardTab {tab1-id :id} {:dashboard_id dashboard-id
                                                      :name "Tab 1"
                                                      :position 0}
                   :model/DashboardTab {tab2-id :id} {:dashboard_id dashboard-id
                                                      :name "Tab 2"
                                                      :position 1}
                   :model/DashboardCard {_dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id card-id
                                                            :dashboard_tab_id tab1-id
                                                            :row 0
                                                            :col 0
                                                            :size_x 4
                                                            :size_y 4}]
      (let [exported (export/export-entity (t2/select-one :model/Dashboard :id dashboard-id))]
        (testing "exports tabs"
          (is (seq (:tabs exported)))
          (is (= 2 (count (:tabs exported)))))

        (testing "tab structure is correct"
          (let [tab1 (first (:tabs exported))]
            (is (some? (:name tab1)))
            (is (number? (:position tab1)))))

        (testing "dashcard references tab"
          (let [dashcard (first (:dashcards exported))]
            (is (some? (:dashboard_tab_id dashcard)))))))))

(deftest dashboard-card-embed-refs-test
  (testing "Dashboard with embedded cards creates proper references"
    (mt/with-temp [:model/Card {card-id :id} {:type :question
                                              :dataset_query (lib/native-query (mt/metadata-provider) "select 1")}
                   :model/Dashboard {dashboard-id :id} {:name "Test Dashboard"
                                                        :parameters []}
                   :model/DashboardCard {_dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id card-id
                                                            :row 0
                                                            :col 0
                                                            :size_x 4
                                                            :size_y 4}]
      (let [rep (export/export-entity (t2/select-one :model/Dashboard :id dashboard-id))
            refs (v0-common/refs rep)]
        (testing "dashboard references the embedded card"
          (is (contains? refs (str "question-" card-id))))))))

(deftest text-dashcard-test
  (testing "Text-only dashcard (no card_id) exports correctly"
    (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard with Text"
                                                        :parameters []}
                   :model/DashboardCard {_dashcard-id :id} {:dashboard_id dashboard-id
                                                            :card_id nil
                                                            :row 0
                                                            :col 0
                                                            :size_x 4
                                                            :size_y 2
                                                            :visualization_settings {:text "Hello, World!"}}]
      (let [exported (export/export-entity (t2/select-one :model/Dashboard :id dashboard-id))]
        (testing "includes text dashcard"
          (is (seq (:dashcards exported)))
          (is (= 1 (count (:dashcards exported)))))

        (testing "text dashcard has nil card_id"
          (let [dashcard (first (:dashcards exported))]
            (is (nil? (:card_id dashcard)))
            (is (some? (get-in dashcard [:visualization_settings :text])))))))))
