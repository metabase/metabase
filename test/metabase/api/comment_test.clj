(ns metabase.api.comment-test
  (:require [clojure.test :refer :all]
            [metabase.api.comment :as comment-api]
            [metabase.models.card :refer [Card]]
            [metabase.models.comment :refer [Comment]]
            [metabase.models.moderation-request :refer [ModerationRequest]]
            [metabase.models.notification :refer [Notification]]
            [metabase.test :as mt]
            [toucan.db :as db]))

(defn- normalized-response
  [moderation-request]
  (dissoc moderation-request :id :updated_at :created_at))

(deftest create-test
  (testing "POST /api/comment"
    (mt/with-temp* [Card              [{card-id :id :as card} {:name "Test Card"}]
                    ModerationRequest [{request-id :id :as request} {:moderated_item_type "card"
                                                                     :moderated_item_id   card-id
                                                                     :requester_id        (mt/user->id :crowberto)}]]
      (mt/with-model-cleanup [Comment Notification]
        (let [raw-response (mt/user-http-request :rasta :post 200 "comment" {:text                "first!!!"
                                                                             :commented_item_id   request-id
                                                                             :commented_item_type "moderation_request"})]
          (is (= {:text                "first!!!"
                  :commented_item_id   request-id
                  :commented_item_type "moderation_request"
                  :author_id        (mt/user->id :rasta)}
                 (normalized-response raw-response)))
          (is (= {:notifier_id   (:id raw-response)
                  :notifier_type "comment"
                  :user_id       (mt/user->id :crowberto)
                  :read          false}
                 (select-keys
                  (db/select-one Notification {:order-by [[:id :desc]]})
                  [:notifier_id :notifier_type :user_id :read]))))

        ;; TODO: test for missing keys, invalid enums
        ))))
