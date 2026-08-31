(ns metabase.comments.models.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.comments.api-test :as at]
   [metabase.comments.models.comment :as comment]
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
    (is (= [6]
           (comment/mentions
            (at/tiptap
             [:p
              "omg is that you? "
              [:smartLink {:entityId 6 :model "user"}]]))))
    (is (= [6]
           (comment/mentions
            (at/tiptap
             [:smartLink {:entityId 6 :model "user"}]))))))
