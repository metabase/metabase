(ns metabase.links.api-test
  "Tests for /api/link endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users :db))

(deftest create-link-test
  (testing "POST /api/link"
    (testing "successfully creates a link with valid data"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/Card card {}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [response (mt/user-http-request :rasta :post 200 "link"
                                                 {:collection_id (u/the-id collection)
                                                  :target_model "card"
                                                  :target_id (u/the-id card)
                                                  :name "Link to Card"
                                                  :description "A test link"})]
              (testing "response has correct structure"
                (is (=? {:id pos-int?
                         :collection_id (u/the-id collection)
                         :target_model "card"
                         :target_id (u/the-id card)
                         :name "Link to Card"
                         :description "A test link"
                         :entity_id string?
                         :created_at string?
                         :updated_at string?
                         :created_by_id (mt/user->id :rasta)}
                        response)))
              (testing "link is persisted in the database"
                (let [link (t2/select-one :model/CollectionLink :id (:id response))]
                  (is (some? link))
                  (is (= "Link to Card" (:name link)))
                  (is (= "A test link" (:description link))))))))))

    (testing "creates a link without optional description"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection {}
                       :model/Dashboard dashboard {}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [response (mt/user-http-request :rasta :post 200 "link"
                                                 {:collection_id (u/the-id collection)
                                                  :target_model "dashboard"
                                                  :target_id (u/the-id dashboard)
                                                  :name "Link to Dashboard"})]
              (is (=? {:id pos-int?
                       :name "Link to Dashboard"
                       :description nil?
                       :target_model "dashboard"
                       :target_id (u/the-id dashboard)}
                      response)))))))

    (testing "validation errors"
      (testing "returns 400 when collection_id is missing"
        (mt/with-temp [:model/Card card {}]
          (is (= "value must be an integer greater than zero."
                 (mt/user-http-request :rasta :post 400 "link"
                                       {:target_model "card"
                                        :target_id (u/the-id card)
                                        :name "Invalid Link"})))))

      (testing "returns 400 when target_model is invalid"
        (mt/with-temp [:model/Collection collection {}
                       :model/Card card {}]
          (is (= "value does not match schema"
                 (mt/user-http-request :rasta :post 400 "link"
                                       {:collection_id (u/the-id collection)
                                        :target_model "invalid-model"
                                        :target_id (u/the-id card)
                                        :name "Invalid Link"})))))

      (testing "returns 400 when name is blank"
        (mt/with-temp [:model/Collection collection {}
                       :model/Card card {}]
          (is (= "value must be a non-blank string."
                 (mt/user-http-request :rasta :post 400 "link"
                                       {:collection_id (u/the-id collection)
                                        :target_model "card"
                                        :target_id (u/the-id card)
                                        :name ""}))))))

    (testing "permission checks"
      (testing "returns 403 when user lacks write access to collection"
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection collection {}
                         :model/Card card {}]
            ;; Don't grant any permissions to the collection
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "link"
                                         {:collection_id (u/the-id collection)
                                          :target_model "card"
                                          :target_id (u/the-id card)
                                          :name "Unauthorized Link"}))))))

      (testing "returns 404 when target doesn't exist"
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection collection {}]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
            (is (= "Not found."
                   (mt/user-http-request :rasta :post 404 "link"
                                         {:collection_id (u/the-id collection)
                                          :target_model "card"
                                          :target_id Integer/MAX_VALUE
                                          :name "Link to Non-existent Card"}))))))

      (testing "returns 404 when target exists but user can't read it"
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection link-collection {}
                         :model/Collection target-collection {}
                         :model/Card card {:collection_id (u/the-id target-collection)}]
            ;; Grant write access to link collection but no access to target collection
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
            (is (= "Not found."
                   (mt/user-http-request :rasta :post 404 "link"
                                         {:collection_id (u/the-id link-collection)
                                          :target_model "card"
                                          :target_id (u/the-id card)
                                          :name "Link to Unreadable Card"})))))))))

(deftest create-link-with-different-target-models-test
  (testing "POST /api/link works with various target model types"
    (testing "creates link to a card"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection link-collection {}
                       :model/Card card {}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [response (mt/user-http-request :rasta :post 200 "link"
                                                 {:collection_id (u/the-id link-collection)
                                                  :target_model "card"
                                                  :target_id (u/the-id card)
                                                  :name "Link to card"})]
              (is (= "card" (:target_model response)))
              (is (= "Link to card" (:name response))))))))

    (testing "creates link to a dashboard"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection link-collection {}
                       :model/Dashboard dashboard {}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [response (mt/user-http-request :rasta :post 200 "link"
                                                 {:collection_id (u/the-id link-collection)
                                                  :target_model "dashboard"
                                                  :target_id (u/the-id dashboard)
                                                  :name "Link to dashboard"})]
              (is (= "dashboard" (:target_model response)))
              (is (= "Link to dashboard" (:name response))))))))

    (testing "creates link to a collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection link-collection {}
                       :model/Collection target-collection {}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
          (perms/grant-collection-read-permissions! (perms-group/all-users) target-collection)
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [response (mt/user-http-request :rasta :post 200 "link"
                                                 {:collection_id (u/the-id link-collection)
                                                  :target_model "collection"
                                                  :target_id (u/the-id target-collection)
                                                  :name "Link to collection"})]
              (is (= "collection" (:target_model response)))
              (is (= "Link to collection" (:name response))))))))))

(deftest collection-items-include-links-test
  (testing "GET /api/collection/:id/items includes links"
    (testing "links appear alongside native collection items"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection link-collection {}
                       :model/Collection target-collection {}
                       :model/Card target-card {:name "Target Card" :collection_id (u/the-id target-collection)}
                       :model/Dashboard native-dashboard {:name "Native Dashboard" :collection_id (u/the-id link-collection)}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
          (perms/grant-collection-read-permissions! (perms-group/all-users) target-collection)
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [link (mt/user-http-request :rasta :post 200 "link"
                                             {:collection_id (u/the-id link-collection)
                                              :target_model "card"
                                              :target_id (u/the-id target-card)
                                              :name "Link to Card"})
                  items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id link-collection) "/items")))]
              (testing "items list includes both link and native item"
                (is (= 2 (count items))))
              (testing "link appears with correct structure"
                (let [link-item (first (filter :link items))]
                  (is (some? link-item))
                  (is (true? (:link link-item)))
                  (is (= (:id link) (:link_id link-item)))
                  (is (= (u/the-id target-card) (:id link-item)))
                  (is (= "card" (:model link-item)))
                  (is (= "Link to Card" (:name link-item)))))
              (testing "native item appears normally"
                (let [native-item (first (remove :link items))]
                  (is (some? native-item))
                  (is (nil? (:link native-item)))
                  (is (= (u/the-id native-dashboard) (:id native-item)))
                  (is (= "dashboard" (:model native-item)))
                  (is (= "Native Dashboard" (:name native-item))))))))))

    (testing "broken links are filtered out"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection link-collection {}
                       :model/Collection inaccessible-collection {}
                       :model/Card accessible-card {:name "Accessible Card"}
                       :model/Card inaccessible-card {:name "Inaccessible Card" :collection_id (u/the-id inaccessible-collection)}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
          ;; Don't grant permissions to inaccessible-collection
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [;; Create link to accessible card
                  good-link (mt/user-http-request :crowberto :post 200 "link"
                                                  {:collection_id (u/the-id link-collection)
                                                   :target_model "card"
                                                   :target_id (u/the-id accessible-card)
                                                   :name "Good Link"})
                  ;; Create link to inaccessible card (as admin)
                  bad-link (mt/user-http-request :crowberto :post 200 "link"
                                                 {:collection_id (u/the-id link-collection)
                                                  :target_model "card"
                                                  :target_id (u/the-id inaccessible-card)
                                                  :name "Bad Link"})
                  ;; Fetch items as non-admin user
                  items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id link-collection) "/items")))]
              (testing "only accessible link appears"
                (is (= 1 (count items)))
                (is (= (:id good-link) (:link_id (first items))))
                (is (= "Good Link" (:name (first items))))
                (is (not-any? #(= (:id bad-link) (:link_id %)) items))))))))

    (testing "links preserve target metadata"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection link-collection {}
                       :model/Card target-card {:name "Target Card"
                                                :description "Card description"
                                                :display "table"}]
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
          (mt/with-model-cleanup [:model/CollectionLink]
            (let [link (mt/user-http-request :rasta :post 200 "link"
                                             {:collection_id (u/the-id link-collection)
                                              :target_model "card"
                                              :target_id (u/the-id target-card)
                                              :name "Link to Card"
                                              :description "Link description"})
                  items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id link-collection) "/items")))
                  link-item (first items)]
              (testing "link uses its own name/description"
                (is (= "Link to Card" (:name link-item)))
                (is (= "Link description" (:description link-item))))
              (testing "link inherits target's display type"
                (is (= "table" (:display link-item))))
              (testing "link has both link_id and target id"
                (is (= (:id link) (:link_id link-item)))
                (is (= (u/the-id target-card) (:id link-item)))))))))))

(deftest collection-items-links-with-different-models-test
  (testing "GET /api/collection/:id/items works with links to different model types"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection link-collection {}
                     :model/Card card {:name "My Card"}
                     :model/Dashboard dashboard {:name "My Dashboard"}
                     :model/Collection subcollection {:name "My Subcollection"}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
        (perms/grant-collection-read-permissions! (perms-group/all-users) subcollection)
        (mt/with-model-cleanup [:model/CollectionLink]
          (mt/user-http-request :rasta :post 200 "link"
                                {:collection_id (u/the-id link-collection)
                                 :target_model "card"
                                 :target_id (u/the-id card)
                                 :name "Link to Card"})
          (mt/user-http-request :rasta :post 200 "link"
                                {:collection_id (u/the-id link-collection)
                                 :target_model "dashboard"
                                 :target_id (u/the-id dashboard)
                                 :name "Link to Dashboard"})
          (mt/user-http-request :rasta :post 200 "link"
                                {:collection_id (u/the-id link-collection)
                                 :target_model "collection"
                                 :target_id (u/the-id subcollection)
                                 :name "Link to Collection"})
          (let [items (:data (mt/user-http-request :rasta :get 200
                                                   (str "collection/" (u/the-id link-collection) "/items")))
                link-models (set (map :model (filter :link items)))]
            (testing "all link types appear in collection items"
              (is (= 3 (count items)))
              (is (= #{"card" "dashboard" "collection"} link-models)))
            (testing "each link has correct structure"
              (doseq [item items]
                (is (true? (:link item)))
                (is (pos-int? (:link_id item)))
                (is (pos-int? (:id item)))
                (is (contains? #{"card" "dashboard" "collection"} (:model item)))))))))))

(deftest collection-items-filter-by-model-includes-links-test
  (testing "GET /api/collection/:id/items?models=link returns only links"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection link-collection {}
                     :model/Collection card-collection {}
                     :model/Card card {:name "My Card" :collection_id (u/the-id card-collection)}
                     :model/Dashboard _native-dashboard {:name "Native Dashboard" :collection_id (u/the-id link-collection)}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) link-collection)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) card-collection)
        (mt/with-model-cleanup [:model/CollectionLink]
          (mt/user-http-request :rasta :post 200 "link"
                                {:collection_id (u/the-id link-collection)
                                 :target_model "card"
                                 :target_id (u/the-id card)
                                 :name "Link to Card"})
          (testing "filtering by models=link returns only links"
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id link-collection) "/items")
                                                     :models "link"))]
              (is (= 1 (count items)))
              (is (= "link" (:model (first items))))
              (is (= "Link to Card" (:name (first items))))))
          (testing "filtering by models=dashboard excludes links"
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" (u/the-id link-collection) "/items")
                                                     :models "dashboard"))]
              (is (= 1 (count items)))
              (is (not= "link" (:model (first items))))
              (is (= "Native Dashboard" (:name (first items)))))))))))
