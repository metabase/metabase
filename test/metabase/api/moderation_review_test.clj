(ns metabase.api.moderation-review-test
  (:require [clojure.test :refer :all]
            [metabase.api.moderation-review :as review-api]
            [metabase.models.card :refer [Card]]
            [metabase.models.moderation-review :refer [ModerationReview]]
            [metabase.test :as mt]))

(defn- normalized-response
  [moderation-review]
  (dissoc moderation-review :id :updated_at :created_at))

(deftest create-test
  (testing "POST /api/moderation-review"
    (mt/with-temp* [Card [{card-id :id :as card} {:name "Test Card"}]]
      (mt/with-model-cleanup [ModerationReview]
        (is (= {:text                "Look at this"
                :moderated_item_id   card-id
                :moderated_item_type "card"
                :moderator_id        (mt/user->id :rasta)
                :status              "pending"}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "moderation-review" {:text                "Look at this"
                                                                            :moderated_item_id   card-id
                                                                            :moderated_item_type "card"}))))
        (is (= {:text                "Look at this"
                :moderated_item_id   card-id
                :moderated_item_type "card"
                :moderator_id        (mt/user->id :rasta)
                :status              "verified"}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "moderation-review" {:text                "Look at this"
                                                                            :moderated_item_id   card-id
                                                                            :moderated_item_type "card"
                                                                            :status              "verified"}))))))))
