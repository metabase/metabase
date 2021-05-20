(ns metabase.api.comment-test
  (:require [clojure.test :refer :all]
            [metabase.api.comment :as comment-api]
            [metabase.models.card :refer [Card]]
            [metabase.models.comment :refer [Comment]]
            [metabase.test :as mt]))

(defn- normalized-response
  [moderation-request]
  (dissoc moderation-request :id :updated_at :created_at))

(deftest create-test
  (testing "POST /api/comment"
    (mt/with-temp* [Card [{card-id :id :as card} {:name "Test Card"}]]
      (mt/with-model-cleanup [Comment]
        (is (= {:text                "first!!!"
                :commented_item_id   card-id
                :commented_item_type "card"
                :author_id        (mt/user->id :rasta)}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "comment" {:text                "first!!!"
                                                                  :commented_item_id   card-id
                                                                  :commented_item_type "card"}))))
        ;; TODO: test for missing keys, invalid enums
        ))))
