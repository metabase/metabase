(ns metabase-enterprise.documents.api.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest document-cards-do-not-appear-in-collection-items
  (testing "GET /api/collection/:id/items excludes cards with document_id"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {doc-id :id} {}
                   :model/Card {normal-card-id :id} {:collection_id coll-id}
                   :model/Card _ {:collection_id coll-id
                                  :document-id doc-id}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}]
      (testing "Normal cards and dashboards appear, but in_document cards do not"
        (is (= #{[normal-card-id "card"]
                 [dash-id "dashboard"]}
               (set (map (juxt :id :model)
                         (:data (mt/user-http-request :rasta :get 200
                                                      (str "collection/" coll-id "/items"))))))))
      (testing "Even with show_dashboard_questions=true, in_document cards do not appear"
        (is (= #{[normal-card-id "card"]
                 [dash-id "dashboard"]}
               (set (map (juxt :id :model)
                         (:data (mt/user-http-request :rasta :get 200
                                                      (str "collection/" coll-id "/items?show_dashboard_questions=true")))))))))))

(deftest document-cards-do-not-appear-in-root-items
  (testing "GET /api/collection/root/items excludes cards with document_id"
    (mt/with-temp [:model/Document {doc-id :id} {}
                   :model/Card {normal-card-id :id} {:collection_id nil
                                                     :name "Normal Root Card"}
                   :model/Card {in-document-card-id :id} {:collection_id nil
                                                          :document_id doc-id
                                                          :name "In Document Root Card"}
                   :model/Dashboard {dash-id :id} {:collection_id nil
                                                   :name "Root Dashboard"}]
      (testing "Normal cards and dashboards in root appear, but in_document cards do not"
        (let [items (mt/user-http-request :rasta :get 200 "collection/root/items")
              root-test-items (filter #(#{normal-card-id dash-id in-document-card-id} (:id %))
                                      (:data items))]
          (is (= #{[normal-card-id "card"]
                   [dash-id "dashboard"]}
                 (set (map (juxt :id :model) root-test-items))))))
      (testing "Even with show_dashboard_questions=true, in_document cards do not appear"
        (let [items (mt/user-http-request :rasta :get 200 "collection/root/items?show_dashboard_questions=true")
              root-test-items (filter #(#{normal-card-id dash-id in-document-card-id} (:id %))
                                      (:data items))]
          (is (= #{[normal-card-id "card"]
                   [dash-id "dashboard"]}
                 (set (map (juxt :id :model) root-test-items)))))))))
