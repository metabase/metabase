(ns metabase.api.comment-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.comment :as api.comment]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
        (is (= [c3-id c2-id c1-id] (filter #{c3-id c2-id c1-id} (map :id result))))
        (is (=? {:model "card" :text "Here is some actual insight..." :model_id card-id :author {:first_name "Rasta"}}
                (first result)))))))

(deftest get-for-model-test
  (testing "GET /api/comment/model=x&model_id=42"
    (mt/with-temp
      [:model/Card    {card-id :id}  {}
       :model/Card    {card2-id :id} {}
       :model/Comment {c1-id :id}    {:model "card" :model_id card-id :text "first!"}
       :model/Comment {c2-id :id}    {:model "card" :model_id card-id :text "first!! Edit: dangit"}
       :model/Comment {c3-id :id}    {:model "card" :model_id card-id :text "Here is some actual insight..."}
       :model/Comment {c4-id :id}    {:model "card" :model_id card2-id :text "Something else"}]
      (let [result (mt/user-http-request :rasta :get 200 (format "comment?model=card&model_id=%d" card-id))]
        (is (= [c1-id c2-id c3-id] (filter #{c4-id c3-id c2-id c1-id} (map :id result))))
        (is (=? {:model "card" :text "first!" :model_id card-id :author {:first_name "Rasta"}}
                (first result)))))))

(deftest comment-creation-test
  (testing "POST /api/comment"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [new-comment {:model "card" :model_id card-id :text "Oh-SHEEN"}
            result      (mt/user-http-request :rasta :post 200 "comment" new-comment)]
        (is (=? (assoc new-comment :author {:first_name "Rasta"})
                result))))))

(deftest comment-resolution-test
  (testing "PUT /api/comment resolved"
    (mt/with-temp
      [:model/Card    {card-id :id}    {}
       :model/Comment {comment-id :id} {:model "card" :model_id card-id :text "first!"}]
      (let [result (mt/user-http-request :rasta :put 200 (format "comment/%d" comment-id) {:resolved true})]
        (is (=? {:resolved true :text "first!" :author {:first_name "Rasta"}}
                result))
        (is (true? (t2/select-one-fn :resolved :model/Comment :id comment-id))))))
  (testing "PUT /api/comment text"
    (mt/with-temp
      [:model/Card    {card-id :id}    {}
       :model/Comment {comment-id :id} {:model "card" :model_id card-id :text "first!"}]
      (let [result (mt/user-http-request :rasta :put 200 (format "comment/%d" comment-id) {:text "oops"})]
        (is (=? {:resolved false :text "oops" :author {:first_name "Rasta"}}
                result))
        (is (= "oops" (t2/select-one-fn :text :model/Comment :id comment-id)))))))
