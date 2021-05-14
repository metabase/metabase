(ns metabase.api.moderation-request-test
  (:require [clojure.test :refer :all]
            [metabase.api.moderation-request :as request-api]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.moderation-request :refer [ModerationRequest]]
            [metabase.models.moderation-review :refer [ModerationReview]]
            [metabase.test :as mt]))

(defn- normalized-response
  [moderation-request]
  (dissoc moderation-request :id :updated_at :created_at))

(deftest create-test
  (testing "POST /api/moderation-request"
    (mt/with-temp* [Card [{card-id :id :as card} {:name "Test Card"}]]
      (mt/with-model-cleanup [ModerationRequest]
        (is (= {:text                "Look at this"
                :moderated_item_id   card-id
                :moderated_item_type "card"
                :requester_id        (mt/user->id :rasta)
                :status              "open"
                :closed_by_id        nil
                :type                "confused"}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "moderation-request" {:text                "Look at this"
                                                                             :type                "confused"
                                                                             :moderated_item_id   card-id
                                                                             :moderated_item_type "card"}))))
        (is (= {:text                "Look at this"
                :moderated_item_id   card-id
                :moderated_item_type "card"
                :requester_id        (mt/user->id :rasta)
                :closed_by_id        nil
                :status              "dismissed"
                :type                "something_wrong"}
               (normalized-response
                (mt/user-http-request :rasta :post 200 "moderation-request" {:text                "Look at this"
                                                                             :status              "dismissed"
                                                                             :type                "something_wrong"
                                                                             :moderated_item_id   card-id
                                                                             :moderated_item_type "card"}))))
        ;; TODO: test for missing keys, invalid enums
        ))))

(deftest update-test
  (testing "PUT /api/moderation-request/:id"
    (mt/with-temp* [Card              [{card-id :id :as card}                  {:name "Test Card"}]
                    Dashboard         [{dashboard-id :id :as dashboard}        {:name "Test Dashboard"}]
                    ModerationRequest [{request-id :id :as moderation-request} {:text                "Look at this"
                                                                                :status              "open"
                                                                                :type                "confused"
                                                                                :requester_id        (mt/user->id :rasta)
                                                                                :moderated_item_id   card-id
                                                                                :moderated_item_type "card"}]
                    ModerationReview  [{review-id :id}                         {:moderated_item_id   card-id
                                                                                :moderated_item_type "card"}]]
      (is (= {:text                "Hello world"
              :moderated_item_id   dashboard-id
              :moderated_item_type "dashboard"
              :requester_id        (mt/user->id :rasta)
              :status              "resolved"
              :type                "confused"
              :closed_by_id        review-id}
             (normalized-response
              (mt/user-http-request :rasta :put 200 (format "moderation-request/%d" request-id) {:text                "Hello world"
                                                                                                 :status              "resolved"
                                                                                                 :moderated_item_id   dashboard-id
                                                                                                 :moderated_item_type "dashboard"
                                                                                                 :closed_by_id        review-id})))))))
