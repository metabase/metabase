(ns metabase-enterprise.transforms.api.transform-tag-test
  "Tests for transform tag CRUD API endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms.models.transform-tag]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest create-tag-test
  (testing "POST /api/ee/transform-tag"
    (mt/with-premium-features #{:transforms}
      (testing "Creates a new tag with valid name"
        (let [tag-name (str "test-tag-" (u/generate-nano-id))
              response (mt/user-http-request :crowberto :post 200 "ee/transform-tag"
                                             {:name tag-name})]
          (try
            (is (some? (:id response)))
            (is (= tag-name (:name response)))
            (is (some? (:created_at response)))
            (is (some? (:updated_at response)))
            ;; Clean up
            (finally
              (t2/delete! :model/TransformTag :id (:id response))))))

      (testing "Returns 400 for duplicate tag name"
        (mt/with-temp [:model/TransformTag tag {}]
          (is (string? (mt/user-http-request :crowberto :post 400 "ee/transform-tag"
                                             {:name (:name tag)}))
              "Should return 400 with error message for duplicate name")))

      (testing "Returns validation error for empty name"
        (let [response (mt/user-http-request :crowberto :post "ee/transform-tag"
                                             {:name ""})]
          (is (:errors response) "Should return validation errors for empty name"))
        (let [response (mt/user-http-request :crowberto :post "ee/transform-tag"
                                             {:name "   "})]
          (is (:errors response) "Should return validation errors for blank name"))))))

(deftest update-tag-test
  (testing "PUT /api/ee/transform-tag/:tag-id"
    (mt/with-premium-features #{:transforms}
      (testing "Updates tag name successfully"
        (mt/with-temp [:model/TransformTag tag {}]
          (let [updated-name (str "updated-" (u/generate-nano-id))
                response (mt/user-http-request :crowberto :put 200
                                               (str "ee/transform-tag/" (:id tag))
                                               {:name updated-name})]
            (is (= (:id tag) (:id response)))
            (is (= updated-name (:name response))))))

      (testing "Returns 404 for non-existent tag"
        (is (= "Not found."
               (mt/user-http-request :crowberto :put 404
                                     "ee/transform-tag/999999"
                                     {:name "new-name"}))))

      (testing "Returns 400 when updating to duplicate name"
        (mt/with-temp [:model/TransformTag existing-tag {}
                       :model/TransformTag tag-to-update {}]
          (is (string? (mt/user-http-request :crowberto :put 400
                                             (str "ee/transform-tag/" (:id tag-to-update))
                                             {:name (:name existing-tag)}))
              "Should return 400 with error message for duplicate name"))))))

(deftest delete-tag-test
  (testing "DELETE /api/ee/transform-tag/:tag-id"
    (mt/with-premium-features #{:transforms}
      (testing "Deletes tag successfully"
        (mt/with-temp [:model/TransformTag tag {}]
          (is (t2/exists? :model/TransformTag :id (:id tag)))
          (mt/user-http-request :crowberto :delete 204 (str "ee/transform-tag/" (:id tag)))
          (is (not (t2/exists? :model/TransformTag :id (:id tag))))))

      (testing "Returns 404 for non-existent tag"
        (is (= "Not found."
               (mt/user-http-request :crowberto :delete 404
                                     "ee/transform-tag/999999")))))))

(deftest list-tags-test
  (testing "GET /api/ee/transform-tag"
    (mt/with-premium-features #{:transforms}
      (testing "Returns all tags ordered by name"
        (mt/with-temp [:model/TransformTag tag1 {:name "tag 1"}
                       :model/TransformTag tag2 {:name "tag 3"}
                       :model/TransformTag tag3 {:name "tag 2"}]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/transform-tag")
                tag-names (map :name response)]
            ;; Should include our test tags
            (is (some #(= (:name tag1) %) tag-names))
            (is (some #(= (:name tag2) %) tag-names))
            (is (some #(= (:name tag3) %) tag-names))
            ;; Should be ordered alphabetically
            (is (= (sort tag-names) tag-names))))))))

(deftest permissions-test
  (testing "Transform tag endpoints require superuser permissions"
    (mt/with-premium-features #{:transforms}
      (testing "POST /api/ee/transform-tag"
        (is (string? (mt/user-http-request :rasta :post 403 "ee/transform-tag"
                                           {:name "test"}))))

      (testing "GET /api/ee/transform-tag"
        (is (string? (mt/user-http-request :rasta :get 403 "ee/transform-tag"))))

      (testing "PUT /api/ee/transform-tag/:tag-id"
        (is (string? (mt/user-http-request :rasta :put 403 "ee/transform-tag/1"
                                           {:name "test"}))))

      (testing "DELETE /api/ee/transform-tag/:tag-id"
        (is (string? (mt/user-http-request :rasta :delete 403 "ee/transform-tag/1")))))))
