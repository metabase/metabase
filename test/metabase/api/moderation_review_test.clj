(ns metabase.api.moderation-review-test
  (:require [clojure.test :refer :all]
            [metabase.api.moderation-review :as review-api]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.moderation-request :refer [ModerationRequest]]
            [metabase.models.moderation-review :refer [ModerationReview]]
            [metabase.models.notification :refer [Notification]]
            [metabase.test :as mt]
            [toucan.db :as db]))

(defn- normalized-response
  [moderation-review]
  (dissoc moderation-review :id :updated_at :created_at))

(deftest create-test
  (testing "POST /api/moderation-review"
    (mt/with-temp* [Card [{card-id :id :as card} {:name "Test Card"}]
                    ModerationRequest [_         {:moderated_item_id   card-id
                                                  :moderated_item_type "card"
                                                  :requester_id        (mt/user->id :crowberto)}]
                    ]
      (mt/with-model-cleanup [ModerationReview Notification]
        (is (= {:text                "Looks good to me"
                :moderated_item_id   card-id
                :moderated_item_type "card"
                :moderator_id        (mt/user->id :rasta)
                :status              "pending"}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "moderation-review" {:text                "Looks good to me"
                                                                            :moderated_item_id   card-id
                                                                            :moderated_item_type "card"}))))
        (let [raw-response (mt/user-http-request :rasta :post 200 "moderation-review" {:text                "Looks good to me"
                                                                                       :moderated_item_id   card-id
                                                                                       :moderated_item_type "card"
                                                                                       :status              "verified"})]
          (is (= {:text                "Looks good to me"
                  :moderated_item_id   card-id
                  :moderated_item_type "card"
                  :moderator_id        (mt/user->id :rasta)
                  :status              "verified"}
                 (normalized-response raw-response)))
          (is (= {:notifier_id (:id raw-response)
                  :notifier_type "moderation_review"
                  :user_id (mt/user->id :crowberto)
                  :read false}
                 (select-keys
                  (db/select-one Notification {:order-by [[:id :desc]]})
                  [:notifier_id :notifier_type :user_id :read]))))))))

(defn- update!
  [id params]
  (mt/user-http-request :rasta :put 200 (format "moderation-review/%d" id) params))

(deftest update-test
  (testing "PUT /api/moderation-review/:id"
    (testing "it updates correctly"
      (mt/with-temp* [Card             [{card-id :id :as card}           {:name "Test Card"}]
                      Dashboard        [{dashboard-id :id :as dashboard} {:name "Test Dashboard"}]
                      ModerationReview [{review-id :id}                  {:text                "Looks good to me"
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
                (update! review-id {:text                "Hello world"
                                    :status              "verified"
                                    :moderated_item_id   dashboard-id
                                    :moderated_item_type "dashboard"}))))))
    (testing "it closes moderation requests"
      (mt/with-temp* [Card             [{card-id :id :as card}                   {:name "Test Card"}]
                      Dashboard        [{dashboard-id :id :as dashboard}         {:name "Test Dashboard"}]
                      ModerationReview [{review-id :id}                          {:text                "Looks good to me"
                                                                                  :status              "pending"
                                                                                  :moderator_id        (mt/user->id :rasta)
                                                                                  :moderated_item_id   card-id
                                                                                  :moderated_item_type "card"}]
                      ModerationRequest [{request-id :id :as moderation-request} {:moderated_item_id   card-id
                                                                                  :moderated_item_type "card"
                                                                                  :type                "verification_request"
                                                                                  :status              "open"}]]
        (is (not (nil? (update! review-id {:status "verified"})))
            (= "resolved"
               (do
                 (update! review-id {:status "verified"})
                 (first
                  (db/select-field :status ModerationRequest :id request-id)))))))))
