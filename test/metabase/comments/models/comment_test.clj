(ns metabase.comments.models.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.comments.api-test :as at]
   [metabase.comments.models.comment :as comment]
   [toucan2.core :as t2]))

(deftest exploration-comment-url-test
  (testing "exploration comment URLs percent-encode path segments and query params"
    (let [exploration (t2/instance :model/Exploration {:id 7})
          comment     {:id                42
                       :child_target_id   "auto:9:42:orders.created_at:default"
                       :context           {:timeline_id 3}}]
      (is (= (str "/question/research/7/group/auto%3A9%3A42%3Aorders.created_at%3Adefault"
                  "?timeline_id=3&comments=true#comment-42")
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
