(ns metabase.api.moderation-review-test
  (:require [clojure.test :refer :all]
            [metabase.api.moderation-review :as review-api]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.moderation-review :refer [ModerationReview]]
            [metabase.test :as mt]))

(defn- normalized-response
  [moderation-review]
  (dissoc moderation-review :id :updated_at :created_at))

(deftest create-test
  (testing "POST /api/moderation-review"
    (mt/with-temp* [Card [{card-id :id :as card} {:name "Test Card"}]]
      (mt/with-model-cleanup [ModerationReview]
        (is (= {:text                "Looks good to me"
                :moderated_item_id   card-id
                :moderated_item_type "card"
                :moderator_id        (mt/user->id :rasta)
                :status              "pending"}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "moderation-review" {:text                "Looks good to me"
                                                                            :moderated_item_id   card-id
                                                                            :moderated_item_type "card"}))))
        (is (= {:text                "Looks good to me"
                :moderated_item_id   card-id
                :moderated_item_type "card"
                :moderator_id        (mt/user->id :rasta)
                :status              "verified"}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "moderation-review" {:text                "Looks good to me"
                                                                            :moderated_item_id   card-id
                                                                            :moderated_item_type "card"
                                                                            :status              "verified"}))))))))
(deftest update-test
  (testing "PUT /api/moderation-review/:id"
    (mt/with-temp* [Card             [{card-id :id :as card}                 {:name "Test Card"}]
                    Dashboard        [{dashboard-id :id :as dashboard}       {:name "Test Dashboard"}]
                    ModerationReview [{request-id :id :as moderation-request} {:text                "Looks good to me"
                                                                               :status              "pending"
                                                                               :moderator_id        (mt/user->id :rasta)
                                                                               :moderated_item_id   card-id
                                                                               :moderated_item_type "card"}]]
      (is (= {:text                "Hello world"
              :moderated_item_id   dashboard-id
              :moderated_item_type "dashboard"
              :status              "verified"
              :moderator_id        (mt/user->id :rasta)}
             (normalized-response
              (mt/user-http-request :rasta :put 200 (format "moderation-review/%d" request-id) {:text                "Hello world"
                                                                                                :status              "verified"
                                                                                                :moderated_item_id   dashboard-id
                                                                                                :moderated_item_type "dashboard"})))))))
