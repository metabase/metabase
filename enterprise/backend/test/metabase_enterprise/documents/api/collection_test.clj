(ns metabase-enterprise.documents.api.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]))

(deftest document-cards-do-not-appear-in-collection-items
  (testing "GET /api/collection/:id/items excludes cards with document_id"
    (mt/with-premium-features #{:documents}
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document {doc-id :id} {}
                     :model/Card {normal-card-id :id} {:collection_id coll-id}
                     :model/Card _ {:collection_id coll-id
                                    :document_id doc-id}
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
                                                        (str "collection/" coll-id "/items?show_dashboard_questions=true"))))))))))))

(deftest document-cards-do-not-appear-in-root-items
  (testing "GET /api/collection/root/items excludes cards with document_id"
    (mt/with-premium-features #{:documents}
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
                   (set (map (juxt :id :model) root-test-items))))))))))

(deftest document-cards-do-not-appear-in-root-items-without-premium
  (testing "GET /api/collection/root/items excludes cards with document_id when documents feature is disabled"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {normal-card-id :id} {:collection_id nil
                                                       :name "Normal Root Card"}
                     :model/Dashboard {dash-id :id} {:collection_id nil
                                                     :name "Root Dashboard"}]
        (testing "Normal cards and dashboards in root appear, no documents"
          (let [items (mt/user-http-request :rasta :get 200 "collection/root/items")
                root-test-items (filter #(#{normal-card-id dash-id} (:id %))
                                        (:data items))]
            (is (= #{[normal-card-id "card"]
                     [dash-id "dashboard"]}
                   (set (map (juxt :id :model) root-test-items))))))))))

(deftest documents-appear-in-collection-items
  (testing "GET /api/collection/:id/items includes documents"
    (mt/with-premium-features #{:documents}
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Document {doc-id :id} {:collection_id coll-id
                                                   :name "Test Document"}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}]
        (testing "Documents appear alongside cards and dashboards"
          (is (= #{[doc-id "document"]
                   [card-id "card"]
                   [dash-id "dashboard"]}
                 (set (map (juxt :id :model)
                           (:data (mt/user-http-request :rasta :get 200
                                                        (str "collection/" coll-id "/items"))))))))))))

(deftest documents-do-not-appear-in-collection-items-without-premium
  (testing "GET /api/collection/:id/items excludes documents when documents feature is disabled"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/Document {doc-id :id} {:collection_id coll-id
                                                   :name "Test Document"}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}]
        (testing "Only cards and dashboards appear, no documents"
          (is (= #{[card-id "card"]
                   [dash-id "dashboard"]}
                 (set (map (juxt :id :model)
                           (:data (mt/user-http-request :rasta :get 200
                                                        (str "collection/" coll-id "/items"))))))))))))

(deftest documents-appear-in-root-items
  (testing "GET /api/collection/root/items includes documents"
    (mt/with-premium-features #{:documents}
      (mt/with-temp [:model/Document {doc-id :id} {:collection_id nil
                                                   :name "Root Document"}
                     :model/Card {card-id :id} {:collection_id nil
                                                :name "Root Card"}
                     :model/Dashboard {dash-id :id} {:collection_id nil
                                                     :name "Root Dashboard"}]
        (testing "Documents appear alongside cards and dashboards in root"
          (let [items (mt/user-http-request :rasta :get 200 "collection/root/items")
                root-test-items (filter #(#{doc-id card-id dash-id} (:id %))
                                        (:data items))]
            (is (= #{[doc-id "document"]
                     [card-id "card"]
                     [dash-id "dashboard"]}
                   (set (map (juxt :id :model) root-test-items))))))))))

(deftest documents-do-not-appear-in-root-items-without-premium
  (testing "GET /api/collection/root/items excludes documents when documents feature is disabled"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card {card-id :id} {:collection_id nil
                                                :name "Root Card"}
                     :model/Document {doc-id :id} {:collection_id nil
                                                   :name "Test Document"}
                     :model/Dashboard {dash-id :id} {:collection_id nil
                                                     :name "Root Dashboard"}]
        (testing "Only cards and dashboards appear in root, no documents"
          (let [items (mt/user-http-request :rasta :get 200 "collection/root/items")
                root-test-items (filter #(#{card-id dash-id} (:id %))
                                        (:data items))]
            (is (= #{[card-id "card"]
                     [dash-id "dashboard"]}
                   (set (map (juxt :id :model) root-test-items))))))))))

(deftest archived-documents-appear-in-trash-items
  (testing "GET /api/collection/trash/items includes documents with archived_directly true"
    (mt/with-premium-features #{:documents}
      (mt/with-temp [:model/Document {archived-doc-id :id} {:collection_id nil
                                                            :name "Archived Document"
                                                            :archived true
                                                            :archived_directly true}
                     :model/Document {normal-doc-id :id} {:collection_id nil
                                                          :name "Normal Document"
                                                          :archived_directly false}
                     :model/Card {archived-card-id :id} {:collection_id nil
                                                         :name "Archived Card"
                                                         :archived true
                                                         :archived_directly true}
                     :model/Dashboard {archived-dash-id :id} {:collection_id nil
                                                              :name "Archived Dashboard"
                                                              :archived true
                                                              :archived_directly true}]
        (testing "Archived documents appear alongside other archived items in trash"
          (let [items (mt/user-http-request :rasta :get 200 (format "collection/%d/items" (collection/trash-collection-id)))
                trash-test-items (filter #(#{archived-doc-id normal-doc-id archived-card-id archived-dash-id} (:id %))
                                         (:data items))]
            (is (= #{[archived-doc-id "document"]
                     [archived-card-id "card"]
                     [archived-dash-id "dashboard"]}
                   (set (map (juxt :id :model) trash-test-items))))
            (testing "Non-archived documents do not appear in trash"
              (is (not (some #(= normal-doc-id (:id %)) trash-test-items))))))))))

(deftest archived-documents-do-not-appear-in-trash-items-without-premium
  (testing "GET /api/collection/trash/items excludes documents when documents feature is disabled"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Document {archived-doc-id :id} {:collection_id nil
                                                            :name "Archived Document"
                                                            :archived true
                                                            :archived_directly true}
                     :model/Card {archived-card-id :id} {:collection_id nil
                                                         :name "Archived Card"
                                                         :archived true
                                                         :archived_directly true}
                     :model/Dashboard {archived-dash-id :id} {:collection_id nil
                                                              :name "Archived Dashboard"
                                                              :archived true
                                                              :archived_directly true}]
        (testing "Only archived cards and dashboards appear in trash, no documents"
          (let [items (mt/user-http-request :rasta :get 200 (format "collection/%d/items" (collection/trash-collection-id)))
                trash-test-items (:data items)]
            (is (= #{[archived-card-id "card"]
                     [archived-dash-id "dashboard"]}
                   (set (map (juxt :id :model) trash-test-items))))))))))
