(ns metabase-enterprise.comments.api-test
  "Tests for /api/ee/comment/ endpoints."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.notification.seed :as notification.seed]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:documents} (f))))

(defn- relaxed-re [& s]
  (re-pattern (str "(?s).*" (str/join ".*" s) ".*")))

;;; tiptap helpers

(defn- render-tiptap [node]
  (if (string? node)
    {:type "text" :text node}
    (let [tag     (case (first node)
                    :p "paragraph"
                    (name (first node)))
          block?  #{"paragraph"}
          attrs   (when (map? (second node)) (second node))
          content (if attrs (drop 2 node) (drop 1 node))]
      (u/remove-nils
       {:type    tag
        :attrs   (cond-> attrs
                   (block? tag) (assoc :_id (str (random-uuid)))
                   true         not-empty)
        :content (when (seq content)
                   (mapv render-tiptap content))}))))

(defn tiptap
  "Little helpers to generate tiptap docs"
  [& content]
  {:type    "doc"
   :content (mapv render-tiptap content)})

(deftest tiptap-helpers-test
  (testing "can generate some content but less verbose"
    (is (=? {:type "doc"
             :content
             [{:type  "paragraph"
               :attrs {:_id string?},
               :content
               [{:type "text" :text "omg is that you? "}
                {:type  "smartLink"
                 :attrs {:entityId 6 :model "user"}}]}]}
            (tiptap [:p
                     "omg is that you? "
                     [:smartLink {:entityId 6 :model "user"}]])))))

;;;

(deftest comments-require-documents-feature
  (testing "GET /api/ee/comment/"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Document {doc-id :id} {}]
        (testing "should not return the comments"
          (mt/user-http-request :crowberto :get 402 "ee/comment/"
                                :target_type "document"
                                :target_id doc-id))))))

(deftest basic-comments-test
  (testing "GET /api/ee/comment/"
    (mt/with-temp [:model/Document {doc-id :id doc :document} {:name       "New Document"
                                                               :creator_id (mt/user->id :lucky)}]
      (mt/with-model-cleanup [:model/CommentReaction
                              :model/Comment
                              :model/Notification]
        (mt/with-fake-inbox
          (notification.seed/seed-notification!)
          (is (set/subset? #{:event/comment-created}
                           (t2/select-fn-set :event_name :model/NotificationSubscription)))
          (testing "returns empty comments list for entity with no comments"
            (is (= {:comments []}
                   (mt/user-http-request :rasta :get 200 "ee/comment/"
                                         :target_type "document"
                                         :target_id doc-id))))
          (testing "creates and returns comments for entity"
            (let [created   (mt/user-http-request :rasta :post 200 "ee/comment/"
                                                  {:target_type "document"
                                                   :target_id   doc-id
                                                   :content     {:text "New comment"}})
                  expected1 {:id          int?
                             :content     {:text "New comment"}
                             :target_type "document"
                             :target_id   doc-id
                             :creator     {:id (mt/user->id :rasta)}
                             :reactions   []}]
              (is (=? expected1 created))
              (is (=? {:comments [expected1]}
                      (mt/user-http-request :rasta :get 200 "ee/comment/"
                                            :target_type "document"
                                            :target_id doc-id)))
              (testing "document creator receives notifications for top-level comments"
                (is (=? {(:email (mt/fetch-user :lucky))
                         [{:subject "Comment on New Document"
                           :body    [{:content (relaxed-re
                                                (str (:common_name (mt/fetch-user :rasta)) " left a comment")
                                                (format "http://localhost:\\d+/document/%s#comment-%s"
                                                        doc-id
                                                        (:id created)))}]}]}
                        (first (swap-vals! mt/inbox empty)))))

              (testing "creates a reply to an existing comment"
                (let [child     (mt/user-http-request :crowberto :post 200 "ee/comment/"
                                                      {:target_type       "document"
                                                       :target_id         doc-id
                                                       :parent_comment_id (:id created)
                                                       :content           {:text "Other comment"}})
                      expected2 {:id                int?
                                 :content           {:text "Other comment"}
                                 :target_type       "document"
                                 :target_id         doc-id
                                 :creator           {:id (mt/user->id :crowberto)}
                                 :parent_comment_id (:id created)
                                 :reactions         []}]
                  (is (=? expected2 child))
                  (is (=? {:comments [expected1 expected2]}
                          (mt/user-http-request :rasta :get 200 "ee/comment/"
                                                :target_type "document"
                                                :target_id doc-id)))
                  (testing "participants in the thread receive notifications for new replies"
                    (is (=? {(:email (mt/fetch-user :rasta))
                             [{:subject "Comment on New Document"
                               :body    [{:content (relaxed-re
                                                    (str (:common_name (mt/fetch-user :crowberto)) " replied to a thread"))}]}]}
                            (first (swap-vals! mt/inbox empty)))))))

              (testing "comment in a thread should send emails to all participants of the thread"
                (let [_another (mt/user-http-request :lucky :post 200 "ee/comment/"
                                                     {:target_type       "document"
                                                      :target_id         doc-id
                                                      :parent_comment_id (:id created)
                                                      :content           {:text "Third comment in a thread"}})]
                  (is (=? {(:email (mt/fetch-user :rasta))
                           [{:subject "Comment on New Document"
                             :body    [{:content (relaxed-re
                                                  (str (:common_name (mt/fetch-user :lucky)) " replied to a thread"))}]}]
                           (:email (mt/fetch-user :crowberto))
                           [{:subject "Comment on New Document"
                             :body    [{:content (relaxed-re
                                                  (str (:common_name (mt/fetch-user :lucky)) " replied to a thread"))}]}]}
                          (first (swap-vals! mt/inbox empty))))))))

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
                      created))
              (testing "Comments on concrete paragraphs are also sent as notifications"
                (is (=? {(:email (mt/fetch-user :lucky))
                         [{:subject "Comment on New Document"
                           :body    [{:content (relaxed-re (format "http://localhost:\\d+/document/%s/comments/%s#comment-%s"
                                                                   doc-id
                                                                   part-id
                                                                   (:id created)))}]}]}
                        (first (swap-vals! mt/inbox empty)))))))

          (testing "Comments with mentions send notification emails"
            (let [_created (mt/user-http-request :rasta :post 200 "ee/comment/"
                                                 {:target_type "document"
                                                  :target_id   doc-id
                                                  :content     (tiptap
                                                                [:smartLink {:model    "user"
                                                                             :entityId (mt/user->id :crowberto)}])})]
              (is (=? {(:email (mt/fetch-user :lucky))     [{:subject "Comment on New Document"}]
                       (:email (mt/fetch-user :crowberto)) [{:subject "Comment on New Document"}]}
                      (first (swap-vals! mt/inbox empty)))))))))))

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
            (is (some? (:deleted_at comment)))))
        (testing "deleting a comment twice leaves sour taste in the mouth"
          ;; NOTE: maybe it's fine and we should just noop here rather than return an error?
          (is (= "Comment is already deleted"
                 (mt/user-http-request :rasta :delete 400 (str "ee/comment/" c1))))))

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

(deftest comments-permissions-test
  (testing "Comment permissions - users without document access cannot read or write comments"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {restricted-col :id}        {:name "Restricted Collection"}
                     :model/Document   {restricted-doc-id :id}     {:collection_id restricted-col
                                                                    :name "Restricted Document"}
                     :model/Comment    {restricted-comment-id :id} {:target_id restricted-doc-id}]

        (mt/with-model-cleanup [:model/Comment]
          (testing "GET /api/ee/comment/ - users without document read permissions cannot see comments"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :get 403 "ee/comment/"
                                         :target_type "document"
                                         :target_id restricted-doc-id))))

          (testing "POST /api/ee/comment/ - users without document read permissions cannot create comments"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :post 403 "ee/comment/"
                                         {:target_type "document"
                                          :target_id   restricted-doc-id
                                          :content     {:text "Comment by lucky"}}))))

          (testing "PUT /api/ee/comment/:id - users without document access cannot update comments"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :put 403 (str "ee/comment/" restricted-comment-id)
                                         {:content {:text "Updated by lucky"}}))))

          (testing "DELETE /api/ee/comment/:id - users without document access cannot delete comments"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :delete 403 (str "ee/comment/" restricted-comment-id)))))

          (testing "POST /api/ee/comment/:id/reaction - users without document access cannot react to comments"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :lucky :post 403 (str "ee/comment/" restricted-comment-id "/reaction")
                                         {:emoji "👍"})))))))))

(deftest mention-entities-test
  (testing "We can get users to mention"
    (is (=? {:data   [{:id int? :common_name "Crowberto Corv" :model "user"}
                      {:id int? :common_name "Lucky Pigeon" :model "user"}
                      {:id int? :common_name "Rasta Toucan" :model "user"}]
             :total  int?
             :limit  50
             :offset 0}
            (-> (mt/user-http-request :rasta :get 200 "ee/comment/mentions" :limit 50)
                (update :data #(filter mt/test-user? %))))))
  (testing "Sandboxed users don't get to see other users"
    (met/with-gtaps-for-user! :rasta {:gtaps {:venues {}}}
      (is (=? {:data   [{:id int? :common_name "Rasta Toucan" :model "user"}]
               :total  1
               :limit  50
               :offset 0}
              (mt/user-http-request :rasta :get 200 "ee/comment/mentions" :limit 50))))))
