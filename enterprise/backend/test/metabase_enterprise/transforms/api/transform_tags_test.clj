(ns ^:mb/driver-tests metabase-enterprise.transforms.api.transform-tags-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.models.transform :as transform.model]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest create-transform-with-tags-test
  (testing "POST /api/ee/transform with tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (testing "Can create transform with tags"
          ;; Create tags via API since we're testing transform creation with existing tags
          (let [tag1 (mt/user-http-request :crowberto :post 200 "ee/transform-tag"
                                           {:name (str "test-tag-1-" (random-uuid))})
                tag2 (mt/user-http-request :crowberto :post 200 "ee/transform-tag"
                                           {:name (str "test-tag-2-" (random-uuid))})]
            (try
              (let [transform (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                    {:name "Test Transform"
                                                     :description "Test with tags"
                                                     :source {:type "query"
                                                              :query {:database (mt/id)
                                                                      :type "native"
                                                                      :native {:query "SELECT 1"}}}
                                                     :target {:type "table"
                                                              :name "test_table"}
                                                     :tag_ids [(:id tag1) (:id tag2)]})]
                (is (= "Test Transform" (:name transform)))
                (is (= [(:id tag1) (:id tag2)] (sort (:tag_ids transform)))))
              (finally
                ;; Clean up the tags we created
                (t2/delete! :model/TransformTag :id [:in [(:id tag1) (:id tag2)]])))))

        (testing "Can create transform without tags"
          (let [transform (mt/user-http-request :crowberto :post 200 "ee/transform"
                                                {:name "Transform Without Tags"
                                                 :source {:type "query"
                                                          :query {:database (mt/id)
                                                                  :type "native"
                                                                  :native {:query "SELECT 1"}}}
                                                 :target {:type "table"
                                                          :name "another_table"}})]
            (is (= "Transform Without Tags" (:name transform)))
            (is (= [] (:tag_ids transform)))))))))

(deftest update-transform-tags-test
  (testing "PUT /api/ee/transform/:id with tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Transform transform {:name "Test Transform"
                                                   :source {:type "query"
                                                            :query {:database (mt/id)
                                                                    :type "native"
                                                                    :native {:query "SELECT 1"}}}
                                                   :target {:type "table"
                                                            :name "test_table"}}
                       :model/TransformTag tag1 {:name "update-tag-1"}
                       :model/TransformTag tag2 {:name "update-tag-2"}
                       :model/TransformTag tag3 {:name "update-tag-3"}]

          (testing "Can add tags to transform"
            (let [updated (mt/user-http-request :crowberto :put 200 (str "ee/transform/" (:id transform))
                                                {:tag_ids [(:id tag1) (:id tag2)]})]
              (is (= [(:id tag1) (:id tag2)] (sort (:tag_ids updated))))))

          (testing "Can update tags on transform"
            (let [updated (mt/user-http-request :crowberto :put 200 (str "ee/transform/" (:id transform))
                                                {:tag_ids [(:id tag2) (:id tag3)]})]
              (is (= [(:id tag2) (:id tag3)] (sort (:tag_ids updated))))))

          (testing "Can remove all tags from transform"
            (let [updated (mt/user-http-request :crowberto :put 200 (str "ee/transform/" (:id transform))
                                                {:tag_ids []})]
              (is (= [] (:tag_ids updated))))))))))

(deftest get-transform-with-tags-test
  (testing "GET /api/ee/transform/:id returns tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Transform transform {:name "Transform With Tags"
                                                   :source {:type "query"
                                                            :query {:database (mt/id)
                                                                    :type "native"
                                                                    :native {:query "SELECT 1"}}}
                                                   :target {:type "table"
                                                            :name "tagged_table"}}
                       :model/TransformTag tag1 {:name "get-tag-1"}
                       :model/TransformTag tag2 {:name "get-tag-2"}]
            ;; Add tags to transform
          (transform.model/update-transform-tags! (:id transform) [(:id tag1) (:id tag2)])

          (testing "Single transform returns tag_ids"
            (let [fetched (mt/user-http-request :crowberto :get 200 (str "ee/transform/" (:id transform)))]
              (is (= [(:id tag1) (:id tag2)] (sort (:tag_ids fetched))))))

          (testing "Transform without tags returns empty array"
            (mt/with-temp [:model/Transform transform2 {:name "Transform Without Tags"
                                                        :source {:type "query"
                                                                 :query {:database (mt/id)
                                                                         :type "native"
                                                                         :native {:query "SELECT 1"}}}
                                                        :target {:type "table"
                                                                 :name "untagged_table"}}]
              (let [fetched (mt/user-http-request :crowberto :get 200 (str "ee/transform/" (:id transform2)))]
                (is (= [] (:tag_ids fetched)))))))))))

(deftest list-transforms-with-tags-test
  (testing "GET /api/ee/transform returns transforms with tag_ids"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Transform transform1 {:name "Transform 1"
                                                    :source {:type "query"
                                                             :query {:database (mt/id)
                                                                     :type "native"
                                                                     :native {:query "SELECT 1"}}}
                                                    :target {:type "table"
                                                             :name "list_table_1"}}
                       :model/Transform transform2 {:name "Transform 2"
                                                    :source {:type "query"
                                                             :query {:database (mt/id)
                                                                     :type "native"
                                                                     :native {:query "SELECT 2"}}}
                                                    :target {:type "table"
                                                             :name "list_table_2"}}
                       :model/TransformTag tag1 {:name "list-tag-1"}
                       :model/TransformTag tag2 {:name "list-tag-2"}]
            ;; Add tags to transforms
          (transform.model/update-transform-tags! (:id transform1) [(:id tag1)])
          (transform.model/update-transform-tags! (:id transform2) [(:id tag1) (:id tag2)])

          (testing "List endpoint returns all transforms with their tag_ids"
            (let [transforms (mt/user-http-request :crowberto :get 200 "ee/transform")
                  t1 (some #(when (= (:id %) (:id transform1)) %) transforms)
                  t2 (some #(when (= (:id %) (:id transform2)) %) transforms)]
              (is (= [(:id tag1)] (:tag_ids t1)))
              (is (= [(:id tag1) (:id tag2)] (sort (:tag_ids t2)))))))))))

(deftest delete-tag-removes-associations-test
  (testing "Deleting a tag removes it from all transforms"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/with-temp [:model/Transform transform {:name "Transform for Delete Test"
                                                   :source {:type "query"
                                                            :query {:database (mt/id)
                                                                    :type "native"
                                                                    :native {:query "SELECT 1"}}}
                                                   :target {:type "table"
                                                            :name "delete_test_table"}}
                       :model/TransformTag tag2 {:name "tag-to-keep"}]
          ;; Create tag1 via API since we're testing its deletion
          (let [tag1 (mt/user-http-request :crowberto :post 200 "ee/transform-tag"
                                           {:name "tag-to-delete"})]
            ;; Add both tags to transform
            (transform.model/update-transform-tags! (:id transform) [(:id tag1) (:id tag2)])

            ;; Verify tags are associated
            (let [fetched (mt/user-http-request :crowberto :get 200 (str "ee/transform/" (:id transform)))]
              (is (= (set [(:id tag1) (:id tag2)]) (set (:tag_ids fetched)))))

            ;; Delete tag1
            (mt/user-http-request :crowberto :delete 204 (str "ee/transform-tag/" (:id tag1)))

            ;; Verify tag1 is removed but tag2 remains
            (let [fetched (mt/user-http-request :crowberto :get 200 (str "ee/transform/" (:id transform)))]
              (is (= [(:id tag2)] (vec (:tag_ids fetched)))))))))))
