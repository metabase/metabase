(ns metabase.content-verification.models.moderation-review-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-verification.models.moderation-review :as moderation-review]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- review
  "A ModerationReview row of the Card with `card-id`."
  [card-id & {:as overrides}]
  (merge {:moderated_item_id   card-id
          :moderated_item_type "card"
          :moderator_id        (mt/user->id :crowberto)
          :status              "verified"
          :text                "review"}
         overrides))

(deftest status-and-item-type-must-be-known-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (testing "inserting unknown status is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid moderation review status"
                              (t2/insert! :model/ModerationReview (review card-id :status "approved")))))
      (testing "inserting unknown item type is refused"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid moderated item type"
                              (t2/insert! :model/ModerationReview (review card-id :moderated_item_type "table")))))
      (is (not (t2/exists? :model/ModerationReview :moderated_item_id card-id)))
      (let [id (t2/insert-returning-pk! :model/ModerationReview (review card-id))]
        (testing "changing status to unknown value is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid moderation review status"
                                (t2/update! :model/ModerationReview :id id {:status "approved"}))))
        (testing "changing item type to unknown value is refused"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid moderated item type"
                                (t2/update! :model/ModerationReview :id id {:moderated_item_type "table"}))))
        (testing "clearing status is accepted"
          (t2/update! :model/ModerationReview :id id {:status nil})
          (is (nil? (t2/select-one-fn :status :model/ModerationReview :id id))))))))

(deftest insert-keeps-single-most-recent-review-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (let [first-id  (t2/insert-returning-pk! :model/ModerationReview (review card-id :most_recent false))
            second-id (t2/insert-returning-pk! :model/ModerationReview (review card-id :text "newer"))]
        (is (= {first-id false, second-id true}
               (t2/select-pk->fn :most_recent :model/ModerationReview :moderated_item_id card-id)))))))

(deftest insert-keeps-newest-reviews-only-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (let [ids (vec (for [i (range (+ 3 moderation-review/max-moderation-reviews))]
                       (t2/insert-returning-pk! :model/ModerationReview (review card-id :text (str "review " i)))))]
        (is (= (set (take-last moderation-review/max-moderation-reviews ids))
               (t2/select-pks-set :model/ModerationReview :moderated_item_id card-id)))))))
