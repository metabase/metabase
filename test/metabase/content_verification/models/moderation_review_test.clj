(ns metabase.content-verification.models.moderation-review-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-verification.schema :as content-verification.schema]
   [metabase.content-verification.write :as content-verification.write]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.search.ingestion :as search.ingestion]
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
    (is (mr/validate ::content-verification.schema/moderation-review.update {:status "verified"}))
    (is (mr/validate ::content-verification.schema/moderation-review.update {:status nil}))
    (is (not (mr/validate ::content-verification.schema/moderation-review.update {:status "approved"}))))
  (testing "item type is card or dashboard"
    (is (mr/validate ::content-verification.schema/moderation-review.update {:moderated_item_type "dashboard"}))
    (is (mr/validate ::content-verification.schema/moderation-review.update {:moderated_item_type :card}))
    (is (not (mr/validate ::content-verification.schema/moderation-review.update {:moderated_item_type "table"})))))

(deftest insert-keeps-single-most-recent-review-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (let [first-id  (:id (content-verification.write/create-review! (review card-id)))
            second-id (:id (content-verification.write/create-review! (review card-id :text "newer")))]
        (is (= {first-id false, second-id true}
               (t2/select-pk->fn :most_recent :model/ModerationReview :moderated_item_id card-id)))))))

(deftest insert-keeps-newest-reviews-only-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (let [ids (vec (for [i (range (+ 3 content-verification.write/max-moderation-reviews))]
                       (:id (content-verification.write/create-review! (review card-id :text (str "review " i))))))]
        (is (= (set (take-last content-verification.write/max-moderation-reviews ids))
               (t2/select-pks-set :model/ModerationReview :moderated_item_id card-id)))))))

(deftest create-review-publishes-events-test
  (let [published (atom [])]
    (events/register-owned-consumer! ::review-events
                                     (fn [{:keys [model]}] (when (= :model/ModerationReview model) :review))
                                     (fn [_owner events _all] (swap! published into events)))
    (try
      (mt/with-temp [:model/Card {card-id :id} {}]
        (mt/with-model-cleanup [:model/ModerationReview]
          (let [ids (vec (for [i (range content-verification.write/max-moderation-reviews)]
                           (:id (content-verification.write/create-review! (review card-id :text (str "review " i))))))]
            (reset! published [])
            (let [new-id (:id (mt/with-test-user :crowberto
                                (content-verification.write/create-review! (review card-id :text "newest"))))]
              (testing "the new review, the review it replaces as most recent and the review beyond the limit"
                (is (= #{[:create new-id] [:update (last ids)] [:delete (first ids)]}
                       (into #{} (map (juxt :operation :id)) @published))))
              (testing "the update event has the review before and after it"
                (is (=? [{:previous-object {:most_recent true} :object {:most_recent false}}]
                        (filter #(= :update (:operation %)) @published))))))))
      (finally
        (events.tu/unregister! ::review-events)))))

(deftest update-review-query-count-test
  (testing "a warm update-review! issues no more queries than master's t2/update! with the hooks, 2"
    (mt/with-temp [:model/Card {card-id :id} {}]
      (mt/with-model-cleanup [:model/ModerationReview]
        (let [id (:id (content-verification.write/create-review! (review card-id)))]
          (mt/with-test-user :crowberto
            (binding [search.ingestion/*disable-updates* true]
              (content-verification.write/update-review! id {:text "warm"} {})
              (t2/with-call-count [call-count]
                (content-verification.write/update-review! id {:text "updated"} {})
                (is (<= (call-count) 2))))))))))
