(ns metabase.api.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.comment :as api.comment]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(comment api.comment/keep-me)

(deftest get-all-test
  (testing "GET /api/comment"
    (mt/with-temp
      [:model/Card    {card-id :id} {}
       :model/Comment {c1-id :id}   {:model "card" :model_id card-id :text "first!"}
       :model/Comment {c2-id :id}   {:model "card" :model_id card-id :text "first!! Edit: dangit"}
       :model/Comment {c3-id :id}   {:model "card" :model_id card-id :text "Here is some actual insight..."}]
      (let [result (mt/user-http-request :rasta :get 200 "comment")]
        (is (= [c3-id c2-id c1-id] (map :id result)))
        (is (=? {:model "card" :text "first!" :model_id card-id :author {:first_name "Rasta"}}
                (last result)))))))

(deftest get-for-model-test
  (testing "GET /api/comment/model=x&model_id=42"
    (mt/with-temp
      [:model/Card    {card-id :id}  {}
       :model/Card    {card2-id :id} {}
       :model/Comment {c1-id :id}    {:model "card" :model_id card-id :text "first!"}
       :model/Comment {c2-id :id}    {:model "card" :model_id card-id :text "first!! Edit: dangit"}
       :model/Comment {c3-id :id}    {:model "card" :model_id card-id :text "Here is some actual insight..."}
       :model/Comment {}             {:model "card" :model_id card2-id :text "Something else"}]
      (let [result (mt/user-http-request :rasta :get 200 (format "comment?model=card&model_id=%d" card-id))]
        (is (= [c1-id c2-id c3-id] (map :id result)))
        (is (=? {:model "card" :text "first!" :model_id card-id :author {:first_name "Rasta"}}
                (first result)))))))

(deftest comment-creation-test
  (testing "POST /api/comment"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [new-comment {:model "card" :model_id card-id :text "Oh-SHEEN"}
            result      (mt/user-http-request :rasta :post 200 "comment" new-comment)]
        (is (=? (assoc new-comment :author {:first_name "Rasta"})
                result))))))
