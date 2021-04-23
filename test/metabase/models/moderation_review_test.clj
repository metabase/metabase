(ns metabase.models.moderation-review-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.moderation-review :as mrev :refer [ModerationReview]]
            [toucan.util.test :as tt]))

(deftest add-moderated-items-test
  (testing "it bails on an empty collection"
    (is (nil? (mrev/add-moderated-items []))))
  (testing "it populates both cards and dashboards"
    (tt/with-temp* [Card              [{card-id :id :as card} {:name "Test Card"}]
                    Dashboard         [{dashboard-id :id :as dashboard} {:name "Test Dashboard"}]
                    ModerationReview  [card-review {:moderated_item_type :card :moderated_item_id card-id}]
                    ModerationReview  [dashboard-review {:moderated_item_type :dashboard :moderated_item_id dashboard-id}]]
      (is (= [card dashboard]
             (map :moderated_item (mrev/add-moderated-items [card-review dashboard-review])))))))
