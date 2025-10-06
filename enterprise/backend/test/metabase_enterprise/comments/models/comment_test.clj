(ns metabase-enterprise.comments.models.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.comments.api-test :as at]
   [metabase-enterprise.comments.models.comment :as comment]))

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
