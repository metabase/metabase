(ns metabase.comments.models.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.comments.api-test :as at]
   [metabase.comments.models.comment :as comment]
   [metabase.comments.schema :as comments.schema]
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

(defn- comment-row
  "A Comment row on the Document with `document-id` by Rasta, with `extra` merged in."
  [document-id & {:as extra}]
  (merge {:target_type "document"
          :target_id   document-id
          :content     (at/tiptap [:p "hello"])
          :creator_id  (mt/user->id :rasta)}
         extra))

(deftest comment-rules-hold-on-every-write-path-test
  (testing "a comment's rules hold for a write through Toucan too, not only through the API"
    (mt/with-temp [:model/Document {doc-id :id}      {}
                   :model/Document {archived-id :id} {:archived true}
                   :model/Comment  {comment-id :id}  {:target_id doc-id}
                   :model/Comment  {other-id :id}    {:target_id doc-id :child_target_id "elsewhere"}]
      (testing "no comment on an archived target"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot comment on archived entities"
                              (t2/insert! :model/Comment (comment-row archived-id)))))
      (testing "a reply is in its parent's thread"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"doesn't belong to the same entity"
                              (t2/insert! :model/Comment (comment-row doc-id :parent_comment_id other-id)))))
      (testing "a deleted comment keeps its content, takes no reactions, and stays deleted once"
        (t2/update! :model/Comment comment-id {:deleted_at :%now})
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot edit content of a deleted comment"
                              (t2/update! :model/Comment comment-id {:content (at/tiptap [:p "edited"])})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Comment is already deleted"
                              (t2/update! :model/Comment comment-id {:deleted_at :%now})))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot react to deleted comments"
                              (t2/insert! :model/CommentReaction {:comment_id comment-id
                                                                  :user_id    (mt/user->id :rasta)
                                                                  :emoji      "👍"}))))
      (testing "no edit once the target is archived"
        (t2/update! :model/Document doc-id {:archived true})
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot edit comments on archived entities"
                              (t2/update! :model/Comment other-id {:is_resolved true})))))))
