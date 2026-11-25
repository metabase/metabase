(ns metabase.content-verification.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.content-verification.db :as content-verification.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- review
  [card-id]
  {:moderated_item_id   card-id
   :moderated_item_type "card"
   :moderator_id        (mt/user->id :crowberto)
   :status              "verified"
   :text                "review"})

(deftest partitioned-reads-match-whole-reads-test
  (mt/with-temp [:model/Card {c1 :id} {}
                 :model/Card {c2 :id} {}
                 :model/Card {c3 :id} {}
                 :model/Card {c4 :id} {}
                 :model/Card {c5 :id} {}]
    (mt/with-model-cleanup [:model/ModerationReview]
      (let [card-ids [c1 c2 c3 c4 c5]]
        (doseq [card-id (concat card-ids (reverse card-ids))]
          (t2/insert! :model/ModerationReview (review card-id)))
        (let [items (mapv #(vector "card" %) card-ids)
              reads {:ordered-reviews  #(mapv :id (content-verification.db/moderation-reviews-for-items #{:card} card-ids))
                     :ordered-statuses #(mapv :moderated_item_id (content-verification.db/most-recent-moderation-review-statuses #{:card} card-ids))
                     :beyond-newest    #(set (map :id (content-verification.db/moderation-reviews-beyond-newest items 1)))
                     :except           #(set (map :id (content-verification.db/most-recent-moderation-reviews-except items [])))
                     :ids-of-cards     #(set (content-verification.db/moderation-review-ids-of-cards card-ids))}]
          (doseq [[read-name read-fn] reads]
            (testing read-name
              (let [whole (read-fn)]
                (is (seq whole))
                (is (= whole (mt/with-partition-size 2
                               (read-fn))))))))))))
