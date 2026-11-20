(ns metabase.comments.models.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.comments.api-test :as at]
   [metabase.comments.models.comment :as comment]
   [metabase.comments.schema :as comments.schema]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest exploration-comment-url-test
  (testing "integer child_target_id deep-links to the comment's page, with context as query params"
    (let [exploration (t2/instance :model/Exploration {:id 7})
          comment     {:id                42
                       :child_target_id   "123"
                       :context           {:timeline_id 3}}]
      (is (= (str "/question/research/7/page/123"
                  "?comments=123&timeline=3#comment-42")
             (comment/url exploration comment)))))
  (testing "uuid child_target_id deep-links to the Summary with the node id in comments"
    (let [exploration (t2/instance :model/Exploration {:id 7})
          comment     {:id                42
                       :child_target_id   "550e8400-e29b-41d4-a716-446655440000"
                       :context           {:timeline_id 3 :scroll_y 120}}]
      (is (= (str "/question/research/7/summary"
                  "?comments=550e8400-e29b-41d4-a716-446655440000&timeline=3#comment-42")
             (comment/url exploration comment))))))

(deftest comment-test
  (testing "mentions are parsed correctly"
    ;; `mentions` reads its `attrs` string-keyed, the shape content takes once normalized on its way into
    ;; or out of the app DB -- `comments.schema/normalize-content` mimics that for this raw tiptap fixture.
    (is (= [6]
           (comment/mentions
            (comments.schema/normalize-content
             (at/tiptap
              [:p
               "omg is that you? "
               [:smartLink {:entityId 6 :model "user"}]])))))
    (is (= [6]
           (comment/mentions
            (comments.schema/normalize-content
             (at/tiptap
              [:smartLink {:entityId 6 :model "user"}])))))))

(defn- refused?
  "Whether `thunk` throws the 403 a permission check throws."
  [thunk]
  (try
    (thunk)
    false
    (catch clojure.lang.ExceptionInfo e
      (= 403 (:status-code (ex-data e))))))

(deftest create-permission-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {readable-col :id}   {}
                   :model/Collection {restricted-col :id} {}
                   :model/Document   {readable-doc :id}   {:collection_id readable-col}
                   :model/Document   {restricted-doc :id} {:collection_id restricted-col}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) readable-col)
      (mt/with-test-user :lucky
        (testing "user who reads target can comment on it"
          (is (true? (api/create-check :model/Comment {:target_type "document" :target_id readable-doc}))))
        (testing "user who cannot read target cannot comment on it"
          (is (refused? #(api/create-check :model/Comment {:target_type "document" :target_id restricted-doc}))))))))

(deftest update-permission-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {col-id :id}     {}
                   :model/Document   {doc-id :id}     {:collection_id col-id}
                   :model/Comment    comment          {:target_id doc-id :creator_id (mt/user->id :rasta)}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) col-id)
      (testing "creator who reads target can edit content but not resolve without write on target"
        (mt/with-test-user :rasta
          (is (true? (api/update-check comment {:content {:type "text" :text "edited"}})))
          (is (true? (mi/can-write? (t2/hydrate comment :can_write))))
          (is (refused? #(api/update-check comment {:is_resolved true})))))
      (testing "other user who reads target can neither edit content nor delete"
        (mt/with-test-user :lucky
          (is (refused? #(api/update-check comment {:content {:type "text" :text "edited"}})))
          (is (false? (mi/can-write? (t2/hydrate comment :can_write))))
          (is (true? (mi/can-read? (t2/hydrate comment :can_read))))))
      (testing "superuser can edit content and resolve"
        (mt/with-test-user :crowberto
          (is (true? (api/update-check comment {:content {:type "text" :text "edited"} :is_resolved true})))))
      (testing "user with write on target can resolve comment of another user"
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) col-id)
        (mt/with-test-user :lucky
          (is (true? (api/update-check comment {:is_resolved true})))
          (is (refused? #(api/update-check comment {:content {:type "text" :text "edited"}}))))))))

(deftest read-permission-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {col-id :id} {}
                   :model/Document   {doc-id :id} {:collection_id col-id}
                   :model/Comment    comment      {:target_id doc-id :creator_id (mt/user->id :lucky)}]
      (testing "creator who cannot read target can neither read nor write own comment"
        (mt/with-test-user :lucky
          (is (false? (mi/can-read? (t2/hydrate comment :can_read))))
          (is (false? (mi/can-write? (t2/hydrate comment :can_write)))))))))

(defn- refused-400?
  "Whether `thunk` throws a 400."
  [thunk]
  (try
    (thunk)
    false
    (catch clojure.lang.ExceptionInfo e
      (= 400 (:status-code (ex-data e))))))

(deftest reply-target-test
  (mt/with-temp [:model/Document {doc-id :id}   {}
                 :model/Document {other-id :id} {}
                 :model/Comment  {parent-id :id} {:target_type "document" :target_id doc-id :child_target_id "n1"
                                                  :creator_id (mt/user->id :rasta)}]
    (let [reply (fn [& {:as overrides}]
                  (merge {:target_type "document" :target_id doc-id :child_target_id "n1"
                          :parent_comment_id parent-id :creator_id (mt/user->id :rasta)
                          :content (at/tiptap [:p "reply"])}
                         overrides))]
      (testing "reply on the same entity and thread is stored"
        (is (some? (t2/insert-returning-pk! :model/Comment (reply)))))
      (testing "reply on another entity is refused"
        (is (refused-400? #(t2/insert! :model/Comment (reply :target_id other-id)))))
      (testing "reply on another thread is refused"
        (is (refused-400? #(t2/insert! :model/Comment (reply :child_target_id "n2")))))
      (testing "moving reply to another entity is refused"
        (let [reply-id (t2/insert-returning-pk! :model/Comment (reply))]
          (is (refused-400? #(t2/update! :model/Comment :id reply-id {:target_id other-id}))))))))

(deftest deleted-content-test
  (mt/with-temp [:model/Document {doc-id :id} {}
                 :model/Comment  {live-id :id} {:target_type "document" :target_id doc-id :creator_id (mt/user->id :rasta)}
                 :model/Comment  {dead-id :id} {:target_type "document" :target_id doc-id :creator_id (mt/user->id :rasta)
                                                :deleted_at (java.time.Instant/now)}]
    (testing "content of live comment can change"
      (is (= 1 (t2/update! :model/Comment :id live-id {:content (at/tiptap [:p "edited"])}))))
    (testing "content of deleted comment cannot change"
      (is (refused-400? #(t2/update! :model/Comment :id dead-id {:content (at/tiptap [:p "edited"])}))))
    (testing "deleted comment can still be resolved"
      (is (= 1 (t2/update! :model/Comment :id dead-id {:is_resolved true}))))))
