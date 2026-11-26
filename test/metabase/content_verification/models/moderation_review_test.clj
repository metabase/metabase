(ns metabase.content-verification.models.moderation-review-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-verification.models.moderation-review :as moderation-review]
   [metabase.content-verification.schema :as content-verification.schema]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
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

(deftest status-and-item-type-schema-test
  (testing "status is verified or nil"
    (is (mr/validate ::content-verification.schema/moderation-review.update {:id 1 :status "verified"}))
    (is (mr/validate ::content-verification.schema/moderation-review.update {:id 1 :status nil}))
    (is (not (mr/validate ::content-verification.schema/moderation-review.update {:id 1 :status "approved"}))))
  (testing "item type is card or dashboard"
    (is (mr/validate ::content-verification.schema/moderation-review.update {:id 1 :moderated_item_type "dashboard"}))
    (is (mr/validate ::content-verification.schema/moderation-review.update {:id 1 :moderated_item_type :card}))
    (is (not (mr/validate ::content-verification.schema/moderation-review.update {:id 1 :moderated_item_type "table"})))))

(deftest create-review-keeps-single-most-recent-review-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (let [first-id  (:id (first (moderation-review/create-moderation-reviews! [(review card-id)])))
            second-id (:id (first (moderation-review/create-moderation-reviews! [(review card-id :text "newer")])))]
        (is (= {first-id false, second-id true}
               (t2/select-pk->fn :most_recent :model/ModerationReview :moderated_item_id card-id)))))))

(deftest create-review-keeps-newest-reviews-only-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (let [ids (vec (for [i (range (+ 3 moderation-review/max-moderation-reviews))]
                       (:id (first (moderation-review/create-moderation-reviews! [(review card-id :text (str "review " i))])))))]
        (is (= (set (take-last moderation-review/max-moderation-reviews ids))
               (t2/select-pks-set :model/ModerationReview :moderated_item_id card-id)))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/ModerationReview :model/Card]
    (let [new-cards (fn [n] (mapv (fn [_] (t2/insert-returning-pk! :model/Card (mt/with-temp-defaults :model/Card))) (range n)))
          rows      (fn [n]
                      (let [card-ids (new-cards n)]
                        (moderation-review/create-moderation-reviews! (mapv #(review %) (take-nth 2 card-ids)))
                        (moderation-review/create-moderation-reviews! (mapv #(review %) (take-nth 2 card-ids)))
                        (dotimes [_ 11]
                          (moderation-review/create-moderation-reviews! (mapv #(review %) (take-nth 3 card-ids))))
                        (mapv #(review %) card-ids)))]
      (testing "creating reviews of items that hold reviews, some beyond the newest"
        (events.tu/statement-count! #(moderation-review/create-moderation-reviews! (rows 1)))
        (let [small (rows 2)
              large (rows 6)]
          (is (= (events.tu/statement-count! #(moderation-review/create-moderation-reviews! small))
                 (events.tu/statement-count! #(moderation-review/create-moderation-reviews! large))))))
      (testing "creating several reviews of one item"
        (let [[card-id] (new-cards 1)
              reviews   (moderation-review/create-moderation-reviews! (mapv (fn [_] (review card-id)) (range 12)))]
          (is (= 12 (count reviews)))
          (is (= 1 (t2/count :model/ModerationReview :moderated_item_id card-id :most_recent true)))
          (is (= 10 (t2/count :model/ModerationReview :moderated_item_id card-id))))))))
