(ns metabase.comments.models.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.comments.api-test :as at]
   [metabase.comments.models.comment :as comment]))

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

(deftest mentions-wrong-entity-id-test
  (testing "content is stored as the client sent it, so `mentions` must not pass non-IDs on to its callers"
    (doseq [entity-id [{:data "string"}
                       ["nested" "vector"]
                       "6"
                       -6
                       0
                       nil]]
      (testing (pr-str entity-id)
        (is (= [6]
               (comment/mentions
                (at/tiptap
                 [:p
                  [:smartLink {:entityId entity-id :model "user"}]
                  [:smartLink {:entityId 6 :model "user"}]]))))))))
