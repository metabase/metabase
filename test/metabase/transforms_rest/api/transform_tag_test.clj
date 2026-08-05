(ns metabase.transforms-rest.api.transform-tag-test
  "Tests for transform tag CRUD API endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.transforms.models.transform-tag]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest create-tag-test
  (testing "POST /api/transform-tag"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (testing "Creates a new tag with valid name"
          (let [tag-name (str "test-tag-" (u/generate-nano-id))
                response (mt/user-http-request :lucky :post 200 "transform-tag"
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
            (is (string? (mt/user-http-request :lucky :post 400 "transform-tag"
                                               {:name (:name tag)}))
                "Should return 400 with error message for duplicate name")))
        (testing "Returns validation error for empty name"
          (let [response (mt/user-http-request :lucky :post "transform-tag"
                                               {:name ""})]
            (is (:errors response) "Should return validation errors for empty name"))
          (let [response (mt/user-http-request :lucky :post "transform-tag"
                                               {:name "   "})]
            (is (:errors response) "Should return validation errors for blank name")))))))

(deftest update-tag-test
  (mt/with-premium-features #{:transforms-basic}
    (testing "PUT /api/transform-tag/:tag-id"
      (mt/with-data-analyst-role! (mt/user->id :lucky)
        (testing "Updates tag name successfully"
          (mt/with-temp [:model/TransformTag tag {}]
            (let [updated-name (str "updated-" (u/generate-nano-id))
                  response     (mt/user-http-request :lucky :put 200
                                                     (str "transform-tag/" (:id tag))
                                                     {:name updated-name})]
              (is (= (:id tag) (:id response)))
              (is (= updated-name (:name response))))))
        (testing "Returns 404 for non-existent tag"
          (is (= "Not found."
                 (mt/user-http-request :lucky :put 404
                                       "transform-tag/999999"
                                       {:name "new-name"}))))
        (testing "Returns 400 when updating to duplicate name"
          (mt/with-temp [:model/TransformTag existing-tag {}
                         :model/TransformTag tag-to-update {}]
            (is (string? (mt/user-http-request :lucky :put 400
                                               (str "transform-tag/" (:id tag-to-update))
                                               {:name (:name existing-tag)}))
                "Should return 400 with error message for duplicate name")))))))

(deftest delete-tag-test
  (testing "DELETE /api/transform-tag/:tag-id"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (testing "Deletes tag successfully"
          (mt/with-temp [:model/TransformTag tag {}]
            (is (t2/exists? :model/TransformTag :id (:id tag)))
            (mt/user-http-request :lucky :delete 204 (str "transform-tag/" (:id tag)))
            (is (not (t2/exists? :model/TransformTag :id (:id tag))))))
        (testing "Returns 404 for non-existent tag"
          (is (= "Not found."
                 (mt/user-http-request :lucky :delete 404
                                       "transform-tag/999999"))))))))

(deftest list-tags-test
  (testing "GET /api/transform-tag"
    (mt/with-data-analyst-role! (mt/user->id :lucky)
      (mt/with-premium-features #{:transforms-basic}
        (testing "Returns all tags ordered by name"
          (mt/with-temp [:model/TransformTag tag1 {:name "tag 1"}
                         :model/TransformTag tag2 {:name "tag 3"}
                         :model/TransformTag tag3 {:name "tag 2"}]
            (let [response (mt/user-http-request :lucky :get 200 "transform-tag")
                  tag-names (map :name response)]
              ;; Should include our test tags
              (is (some #(= (:name tag1) %) tag-names))
              (is (some #(= (:name tag2) %) tag-names))
              (is (some #(= (:name tag3) %) tag-names))
              ;; Should be ordered alphabetically
              (is (= (sort tag-names) tag-names)))))))))

(deftest permissions-test
  (testing "Transform tag endpoints require data-analyst permissions"
    (mt/with-premium-features #{:transforms-basic}
      (testing "POST /api/transform-tag"
        (is (string? (mt/user-http-request :rasta :post 403 "transform-tag"
                                           {:name "test"}))))
      (testing "GET /api/transform-tag"
        (is (string? (mt/user-http-request :rasta :get 403 "transform-tag"))))
      (testing "PUT /api/transform-tag/:tag-id"
        (is (string? (mt/user-http-request :rasta :put 403 "transform-tag/1"
                                           {:name "test"}))))
      (testing "DELETE /api/transform-tag/:tag-id"
        (is (string? (mt/user-http-request :rasta :delete 403 "transform-tag/1")))))))

;;; ------------------------------------------ remote-sync worktrees ------------------------------------------
;;; A worktree is an enterprise concept, so these need `:model/Worktree` on the classpath. The
;;; endpoints they cover are OSS.

(deftest worktree-tags-are-excluded-from-the-list-test
  (when config/ee-available?
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Worktree {wt-id :id} {}
                     :model/TransformTag {main-tag :id} {:name (str "main-" (u/generate-nano-id))}
                     :model/TransformTag {wt-tag :id} {:name        (str "wt-" (u/generate-nano-id))
                                                       :worktree_id wt-id}]
        (let [ids (into #{} (map :id) (mt/user-http-request :crowberto :get 200 "transform-tag"))]
          (is (contains? ids main-tag))
          (is (not (contains? ids wt-tag))))
        (testing "worktree-id returns only that worktree's tags"
          (is (= [wt-tag]
                 (mapv :id (mt/user-http-request :crowberto :get 200 "transform-tag" :worktree-id wt-id)))))
        (testing "worktree-id is admin-only"
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :get 403 "transform-tag" :worktree-id wt-id)))))))))

(deftest worktree-tag-endpoints-are-admin-only-test
  (when config/ee-available?
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Worktree {wt-id :id} {}
                     :model/TransformTag {tag-id :id} {:name        (str "wt-" (u/generate-nano-id))
                                                       :worktree_id wt-id}]
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (testing "a data analyst cannot see or touch it"
            (is (not (contains? (into #{} (map :id) (mt/user-http-request :lucky :get 200 "transform-tag"))
                                tag-id)))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :put 403 (format "transform-tag/%d" tag-id) {:name "nope"})))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :delete 403 (format "transform-tag/%d" tag-id))))))
        (testing "an admin can rename it"
          (is (=? {:id tag-id :worktree_id wt-id :name "renamed in worktree"}
                  (mt/user-http-request :crowberto :put 200 (format "transform-tag/%d" tag-id)
                                        {:name "renamed in worktree"}))))))))

(deftest worktree-tag-names-are-scoped-to-their-worktree-test
  (when config/ee-available?
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Worktree {wt-id :id} {}]
        (let [tag-name (str "shared-" (u/generate-nano-id))]
          (mt/with-temp [:model/TransformTag _ {:name tag-name}]
            (mt/with-model-cleanup [:model/TransformTag]
              (testing "the same name is free inside a worktree"
                (is (=? {:name tag-name :worktree_id wt-id}
                        (mt/user-http-request :crowberto :post 200 "transform-tag"
                                              {:name tag-name :worktree_id wt-id}))))
              (testing "but still taken in the main app"
                (is (= (format "A tag with the name '%s' already exists." tag-name)
                       (mt/user-http-request :crowberto :post 400 "transform-tag" {:name tag-name})))))))))))

(deftest creating-a-worktree-tag-over-the-api-test
  (when config/ee-available?
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Worktree {wt-id :id} {}]
        (testing "a data analyst cannot"
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :post 403 "transform-tag"
                                         {:name "sneaky" :worktree_id wt-id})))))
        (testing "an unknown worktree 404s rather than failing on the foreign key"
          (is (= "Not found."
                 (mt/user-http-request :crowberto :post 404 "transform-tag"
                                       {:name "nope" :worktree_id 99999999}))))))))

(deftest worktree-tag-cannot-be-attached-to-a-job-over-the-api-test
  (when config/ee-available?
    (testing "jobs are main-app only, so a worktree tag is refused"
      (mt/with-premium-features #{:transforms-basic}
        (mt/with-temp [:model/Worktree {wt-id :id} {}
                       :model/TransformTag {wt-tag :id} {:name        (str "wt-" (u/generate-nano-id))
                                                         :worktree_id wt-id}]
          (is (=? {:cause "A tag in a remote sync worktree cannot be added to a job."}
                  (mt/user-http-request :crowberto :post 400 "transform-job"
                                        {:name     (str "job-" (u/generate-nano-id))
                                         :schedule "0 0 0 * * ?"
                                         :tag_ids  [wt-tag]}))))))))
