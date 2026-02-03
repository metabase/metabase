(ns metabase.documents.api.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]))

(deftest document-cards-do-not-appear-in-collection-items
  (testing "GET /api/collection/:id/items excludes cards with document_id"
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

(deftest documents-appear-in-collection-items
  (testing "GET /api/collection/:id/items includes documents"
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
                                                      (str "collection/" coll-id "/items")))))))))))

(deftest documents-appear-in-root-items
  (testing "GET /api/collection/root/items includes documents"
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
                 (set (map (juxt :id :model) root-test-items)))))))))

(deftest archived-documents-appear-in-trash-items
  (testing "GET /api/collection/trash/items includes documents with archived_directly true"
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
          (is (= #{[archived-doc-id "document" true true]
                   [archived-card-id "card" true true]
                   [archived-dash-id "dashboard" true true]}
                 (set (map (juxt :id :model :can_delete :can_restore) trash-test-items))))
          (testing "Non-archived documents do not appear in trash"
            (is (not (some #(= normal-doc-id (:id %)) trash-test-items)))))))))

(deftest document-pinning-collection-items
  (testing "GET /api/collection/:id/items supports pinned_state parameter for documents"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {pinned-doc-id :id} {:collection_id coll-id
                                                        :name "Pinned Document"
                                                        :collection_position 1}
                   :model/Document {unpinned-doc-id :id} {:collection_id coll-id
                                                          :name "Unpinned Document"
                                                          :collection_position nil}
                   :model/Card {pinned-card-id :id} {:collection_id coll-id
                                                     :name "Pinned Card"
                                                     :collection_position 2}
                   :model/Card {unpinned-card-id :id} {:collection_id coll-id
                                                       :name "Unpinned Card"
                                                       :collection_position nil}]
      (testing "pinned_state=is_pinned returns only pinned documents and cards"
        (let [items (:data (mt/user-http-request :rasta :get 200
                                                 (str "collection/" coll-id "/items?pinned_state=is_pinned")))
              item-ids (set (map (juxt :model :id) items))]
          (is (contains? item-ids ["document" pinned-doc-id]))
          (is (contains? item-ids ["card" pinned-card-id]))
          (is (not (contains? item-ids ["document" unpinned-doc-id])))
          (is (not (contains? item-ids ["card" unpinned-card-id])))))

      (testing "pinned_state=is_not_pinned returns only unpinned documents and cards"
        (let [items (:data (mt/user-http-request :rasta :get 200
                                                 (str "collection/" coll-id "/items?pinned_state=is_not_pinned")))
              item-ids (set (map (juxt :model :id) items))]
          (is (not (contains? item-ids ["document" pinned-doc-id])))
          (is (not (contains? item-ids ["card" pinned-card-id])))
          (is (contains? item-ids ["document" unpinned-doc-id]))
          (is (contains? item-ids ["card" unpinned-card-id]))))

      (testing "pinned_state=all returns all documents and cards"
        (let [items (:data (mt/user-http-request :rasta :get 200
                                                 (str "collection/" coll-id "/items?pinned_state=all")))
              item-ids (set (map (juxt :model :id) items))]
          (is (contains? item-ids ["document" pinned-doc-id]))
          (is (contains? item-ids ["card" pinned-card-id]))
          (is (contains? item-ids ["document" unpinned-doc-id]))
          (is (contains? item-ids ["card" unpinned-card-id])))))))

(deftest document-pinning-root-items
  (testing "GET /api/collection/root/items supports pinned_state parameter for documents"
    (mt/with-temp [:model/Document {pinned-doc-id :id} {:collection_id nil
                                                        :name "Pinned Root Document"
                                                        :collection_position 1}
                   :model/Document {unpinned-doc-id :id} {:collection_id nil
                                                          :name "Unpinned Root Document"
                                                          :collection_position nil}
                   :model/Card {pinned-card-id :id} {:collection_id nil
                                                     :name "Pinned Root Card"
                                                     :collection_position 2}
                   :model/Card {unpinned-card-id :id} {:collection_id nil
                                                       :name "Unpinned Root Card"
                                                       :collection_position nil}]
      (testing "pinned_state=is_pinned returns only pinned root documents and cards"
        (let [items (:data (mt/user-http-request :rasta :get 200 "collection/root/items?pinned_state=is_pinned"))
              test-item-ids (set (map (juxt :model :id) items))]
          (is (contains? test-item-ids ["document" pinned-doc-id]))
          (is (contains? test-item-ids ["card" pinned-card-id]))
          (is (not (contains? test-item-ids ["document" unpinned-doc-id])))
          (is (not (contains? test-item-ids ["card" unpinned-card-id])))))

      (testing "pinned_state=is_not_pinned returns only unpinned root documents and cards"
        (let [items (:data (mt/user-http-request :rasta :get 200 "collection/root/items?pinned_state=is_not_pinned"))
              test-item-ids (set (map (juxt :model :id) items))]
          (is (not (contains? test-item-ids ["document" pinned-doc-id])))
          (is (not (contains? test-item-ids ["card" pinned-card-id])))
          (is (contains? test-item-ids ["document" unpinned-doc-id]))
          (is (contains? test-item-ids ["card" unpinned-card-id])))))))

(deftest mixed-pinned-unpinned-documents-collection-view
  (testing "Integration test for mixed pinned/unpinned documents in collection view"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Document {doc1-id :id} {:collection_id coll-id
                                                  :name "Document A"
                                                  :collection_position 1}
                   :model/Document _ {:collection_id coll-id
                                      :name "Document B"
                                      :collection_position nil}
                   :model/Document {doc3-id :id} {:collection_id coll-id
                                                  :name "Document C"
                                                  :collection_position 3}]
      (testing "Default view includes all documents with collection_position field"
        (let [items (:data (mt/user-http-request :rasta :get 200
                                                 (str "collection/" coll-id "/items")))
              docs (filter #(= "document" (:model %)) items)
              doc-positions (map :collection_position docs)]
          (is (= 3 (count docs)))
          ;; Verify collection_position is included in the response
          (is (some #(= 1 %) doc-positions))
          (is (some nil? doc-positions))
          (is (some #(= 3 %) doc-positions))))

      (testing "Pinned documents have higher collection_position values and appear before unpinned"
        (let [items (:data (mt/user-http-request :rasta :get 200
                                                 (str "collection/" coll-id "/items?pinned_state=is_pinned")))
              pinned-docs (filter #(= "document" (:model %)) items)]
          (is (= 2 (count pinned-docs)))
          ;; Verify all pinned docs have non-nil collection_position
          (is (every? #(some? (:collection_position %)) pinned-docs))
          (is (= #{doc1-id doc3-id} (set (map :id pinned-docs)))))))))
