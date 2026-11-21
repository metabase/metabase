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
