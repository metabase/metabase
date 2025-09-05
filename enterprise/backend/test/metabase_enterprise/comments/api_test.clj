(ns metabase-enterprise.comments.api-test
  "Tests for /api/ee/comment/ endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest basic-comments-test
  (testing "GET /api/ee/comment/"
    (mt/with-temp [:model/Document {doc-id :id doc :document} {}]
      (mt/with-model-cleanup [:model/CommentReaction
                              :model/Comment]
        (testing "returns empty comments list for entity with no comments"
          (is (= {:comments []}
                 (mt/user-http-request :rasta :get 200 "ee/comment/"
                                       :target_type "document"
                                       :target_id doc-id))))

        (testing "creates and returns comments for entity"
          (let [created  (mt/user-http-request :rasta :post 200 "ee/comment/"
                                               {:target_type "document"
                                                :target_id   doc-id
                                                :content     {:text "New comment"}})
                expected {:id          int?
                          :content     {:text "New comment"}
                          :target_type "document"
                          :target_id   doc-id
                          :creator     {:id (mt/user->id :rasta)}
                          :reactions   []}]
            (is (=? expected created))
            (is (=? {:comments [expected]}
                    (mt/user-http-request :rasta :get 200 "ee/comment/"
                                          :target_type "document"
                                          :target_id doc-id)))

            (testing "creates a reply to an existing comment"
              (let [created (mt/user-http-request :rasta :post 200 "ee/comment/"
                                                  {:target_type       "document"
                                                   :target_id         doc-id
                                                   :parent_comment_id (:id created)
                                                   :content           {:text "Other comment"}})
                    child   (assoc-in expected [:content :text] "Other comment")]
                (is (=? child created))
                (is (=? {:comments [expected child]}
                        (mt/user-http-request :rasta :get 200 "ee/comment/"
                                              :target_type "document"
                                              :target_id doc-id)))))))

        (testing "creates a comment for part of an entity"
          (let [part-id (-> doc :content first :attrs :_id)
                created (mt/user-http-request :rasta :post 200 "ee/comment/"
                                              {:target_type     "document"
                                               :target_id       doc-id
                                               :child_target_id part-id
                                               :content         {:text "Part comment"}})]
            (is (=? {:id              int?
                     :content         {:text "Part comment"}
                     :target_type     "document"
                     :target_id       doc-id
                     :child_target_id part-id
                     :creator         {:id (mt/user->id :rasta)}
                     :reactions       []}
                    created))))))))

(deftest update-comment-test
  (testing "PUT /api/ee/comment/:comment-id"
    (mt/with-temp [:model/Document {doc-id :id}     {}
                   :model/Comment  {comment-id :id} {:target_id doc-id}]
      (testing "updates comment content"
        (is (=? {:content {:text "Updated content"}}
                (mt/user-http-request :rasta :put 200 (str "ee/comment/" comment-id)
                                      {:content {"text" "Updated content"}}))))

      (testing "updates comment resolution status"
        (is (=? {:is_resolved true}
                (mt/user-http-request :rasta :put 200 (str "ee/comment/" comment-id)
                                      {:is_resolved true})))))))

(deftest delete-comment-test
  (testing "DELETE /api/ee/comment/:comment-id"
    (mt/with-temp [:model/Document {doc-id :id} {}
                   :model/Comment  {c1 :id}     {:target_id doc-id}
                   :model/Comment  {c2 :id}     {:target_id doc-id}
                   :model/Comment  {c3 :id}     {:target_id         doc-id
                                                 :parent_comment_id c2}]
      (testing "soft deletes a comment"
        (is (= nil
               (mt/user-http-request :rasta :delete 204 (str "ee/comment/" c1))))
        (testing "comment is marked as deleted in database"
          (let [comment (t2/select-one :model/Comment :id c1)]
            (is (some? (:deleted_at comment))))))

      (testing "deleting parent comment still leaves it in a response"
        (is (= nil
               (mt/user-http-request :rasta :delete 204 (str "ee/comment/" c2))))
        (is (=? {:comments [{:id         c2
                             :deleted_at some?}
                            {:id         c3
                             :deleted_at nil}]}
                (mt/user-http-request :rasta :get 200 "ee/comment/"
                                      :target_type "document"
                                      :target_id doc-id)))))))

(deftest toggle-reaction-test
  (testing "POST /api/ee/comment/:comment-id/reaction"
    (mt/with-temp [:model/Document {doc-id :id}     {}
                   :model/Comment  {comment-id :id} {:target_id doc-id}]
      (testing "adds a reaction to a comment"
        (is (=? {:reacted true}
                (mt/user-http-request :rasta :post 200 (str "ee/comment/" comment-id "/reaction")
                                      {:emoji "👍"})))

        (is (=? {:comments [{:id        comment-id
                             :reactions [{:emoji "👍"
                                          :count 1
                                          :users [{:id (mt/user->id :rasta)}]}]}]}
                (mt/user-http-request :rasta :get 200 "ee/comment/"
                                      :target_type "document"
                                      :target_id doc-id))))

      (testing "removes an existing reaction when toggled again"
        (is (=? {:reacted false}
                (mt/user-http-request :rasta :post 200 (str "ee/comment/" comment-id "/reaction")
                                      {:emoji "👍"})))

        (is (=? {:comments [{:id        comment-id
                             :reactions []}]}
                (mt/user-http-request :rasta :get 200 "ee/comment/"
                                      :target_type "document"
                                      :target_id doc-id)))))))
