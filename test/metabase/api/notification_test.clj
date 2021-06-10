(ns metabase.api.notification-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.api.notification :as notification-api]
            [metabase.models.card :refer [Card]]
            [metabase.models.comment :refer [Comment]]
            [metabase.models.moderation-review :refer [ModerationReview]]
            [metabase.models.notification :refer [Notification]]
            [metabase.test :as mt]))

(defn- minutes-ago
  [minutes]
  (t/minus (t/zoned-date-time)
           (t/minutes minutes)))

(deftest get-test
  (testing "GET /api/notification"
    (mt/with-temp* [Card             [{card-id :id}            {:name "The Card"}]
                    ModerationReview [{review-id :id}          {:moderated_item_id   card-id
                                                                :moderated_item_type "card"
                                                                :text                "Looks good"}]
                    Comment          [{comment-id :id}         {:commented_item_id   review-id
                                                                :commented_item_type "moderation_review"
                                                                :text                "I love toucans"}]
                    Notification     [{a-id :id}               {:notifier_id   review-id
                                                                :notifier_type "moderation_review"
                                                                :user_id       (mt/user->id :rasta)}]
                    Notification     [{b-id :id}               {:notifier_id   comment-id
                                                                :notifier_type "comment"
                                                                :user_id       (mt/user->id :rasta)}]
                    Notification     [{c-id :id}               {:notifier_id   review-id
                                                                :notifier_type "moderation_review"
                                                                :user_id       (mt/user->id :rasta)}]
                    Notification     [{wrong-user-id :id}      {:notifier_id   review-id
                                                                :notifier_type "moderation_review"
                                                                :user_id       (mt/user->id :crowberto)}]
                    Notification     [{read-id :id}            {:notifier_id   review-id
                                                                :notifier_type "moderation_review"
                                                                :user_id       (mt/user->id :rasta)
                                                                :read          true}]]
      (let [notifications (mt/user-http-request :rasta :get 200 "notification")
            review        (-> notifications first :notifier)
            comment       (-> notifications second :notifier)]
        (def zzn notifications)
        (is (= [c-id b-id a-id]
               (map :id notifications)))
        (is (>= (map :created_at notifications)))
        (is (= "Looks good"     (-> review :text)))
        (is (= "The Card"       (-> review :moderated_item :name)))
        (is (= "I love toucans" (-> comment :text)))))))
