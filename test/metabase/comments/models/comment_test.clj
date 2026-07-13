(ns metabase.comments.models.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.comments.api-test :as at]
   [metabase.comments.models.comment :as comment]
   [metabase.test :as mt]))

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

(deftest threads-anchored-to-test
  (mt/with-temp [:model/Document {doc-id :id}       {}
                 :model/Document {other-doc-id :id} {}
                 :model/Comment  {anchored :id}     {:target_id doc-id :child_target_id "block-1"}
                 :model/Comment  {reply :id}        {:target_id doc-id :child_target_id "block-1"
                                                     :parent_comment_id anchored}
                 :model/Comment  {_elsewhere :id}   {:target_id doc-id :child_target_id "block-2"}
                 :model/Comment  {_deleted :id}     {:target_id doc-id :child_target_id "block-1"
                                                     :deleted_at :%now}
                 :model/Comment  {_other-doc :id}   {:target_id other-doc-id :child_target_id "block-1"}]
    (testing "only the live root comments anchored to the given blocks of the given document come back"
      (is (= [anchored]
             (map :id (comment/threads-anchored-to doc-id ["block-1"]))))
      (is (not (contains? (set (map :id (comment/threads-anchored-to doc-id ["block-1"]))) reply))))
    (testing "several blocks at once"
      (is (= 2 (count (comment/threads-anchored-to doc-id ["block-1" "block-2"])))))
    (testing "a block nothing is anchored to, and no blocks at all"
      (is (empty? (comment/threads-anchored-to doc-id ["block-3"])))
      (is (empty? (comment/threads-anchored-to doc-id []))))))
