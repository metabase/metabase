(ns metabase.audit-app.events.internal-writes-test
  "The writes that the product makes while it serves a user's request are not that user's actions: they record no audit
  row, as before the events came from the models."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users :web-server))

(defn- max-id []
  (or (:id (t2/query-one {:select [[:%max.id :id]] :from [:audit_log]})) 0))

(defn- rows-since [before]
  (mapv #(select-keys % [:topic :model :model_id :details])
        (t2/select :model/AuditLog {:where [:> :id before] :order-by [[:id :asc]]})))

(defn- topics-since [before]
  (mapv (juxt :topic :model :model_id) (rows-since before)))

(defn- venues-query []
  (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(deftest api-key-writes-record-only-api-key-rows-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/PermissionsGroup {group-1 :id} {:name "First group"}
                   :model/PermissionsGroup {group-2 :id} {:name "Second group"}]
      (let [{key-id :id} (mt/user-http-request :crowberto :post 200 "api-key" {:group_id group-1 :name "Key"})
            key-user     (t2/select-one-fn :user_id :model/ApiKey :id key-id)]
        (testing "renaming the key"
          (let [before (max-id)]
            (mt/user-http-request :crowberto :put 200 (str "api-key/" key-id) {:name "Renamed key"})
            (is (= [[:api-key-update "ApiKey" key-id]] (topics-since before)))))
        (testing "moving the key to another group leaves the previous group in the api-key row only"
          (let [before (max-id)]
            (mt/user-http-request :crowberto :put 200 (str "api-key/" key-id) {:group_id group-2})
            (let [rows (rows-since before)]
              (is (= [:api-key-update] (map :topic (filter #(= "ApiKey" (:model %)) rows))))
              (is (= [] (filter #(and (not= "ApiKey" (:model %)) (contains? (:details %) :previous-group)) rows))))))
        (testing "deleting the key"
          (let [before (max-id)]
            (mt/user-http-request :crowberto :delete 204 (str "api-key/" key-id))
            (is (= [] (filter #(= key-user (:model_id %)) (rows-since before))))
            (is (= [:api-key-delete] (map :topic (filter #(= "ApiKey" (:model %)) (rows-since before)))))))))))

(deftest creating-exploration-records-no-document-row-test
  (mt/with-premium-features #{:audit-app}
    (let [before (max-id)
          {id :id} (mt/user-http-request :crowberto :post 200 "exploration" {:name "Exploration"})]
      (try
        (is (= [] (filter (comp #{"Document"} second) (topics-since before))))
        (finally
          (t2/delete! :model/Exploration :id id))))))

(deftest saving-question-into-dashboard-records-add-cards-test
  (testing "a question saved into a dashboard is recorded as added to it, as well as created"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Dashboard"}]
        (mt/with-model-cleanup [:model/Card]
          (let [before (max-id)
                card   (mt/user-http-request :crowberto :post 200 "card"
                                             {:name                   "Dashboard question"
                                              :display                "table"
                                              :visualization_settings {}
                                              :dashboard_id           dashboard-id
                                              :dataset_query          (venues-query)})]
            (is (= [[:card-create "Card" (:id card)] [:dashboard-add-cards "Dashboard" dashboard-id]]
                   (topics-since before)))))))))

(deftest reverting-dashboard-records-card-rows-test
  (testing "a revert that brings cards back is recorded as adding them"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card {card-id :id} {:name "Card"}
                     :model/Dashboard {dashboard-id :id} {:name "Dashboard"}]
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" dashboard-id)
                              {:dashcards [{:id -1 :card_id card-id :row 0 :col 0 :size_x 4 :size_y 4}] :tabs []})
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" dashboard-id) {:dashcards [] :tabs []})
        (let [revision-id (t2/select-one-fn :id :model/Revision :model "Dashboard" :model_id dashboard-id
                                            {:order-by [[:id :asc]] :limit 1})
              before      (max-id)]
          (mt/user-http-request :crowberto :post 200 "revision/revert"
                                {:entity "dashboard" :id dashboard-id :revision_id revision-id})
          (is (= [[:dashboard-add-cards "Dashboard" dashboard-id]] (topics-since before))))))))
