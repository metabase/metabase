(ns metabase.models.moderation-request-test
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.moderation-request :as mreq :refer [ModerationRequest]]
            [toucan.util.test :as tt]))

(deftest add-moderated-items-test
  (testing "it bails on an empty collection"
    (is (nil? (mreq/add-moderated-items []))))
  (testing "it populates both cards and dashboards"
    (tt/with-temp* [Card              [{card-id :id :as card} {:name "Test Card"}]
                    Dashboard         [{dashboard-id :id :as dashboard} {:name "Test Dashboard"}]
                    ModerationRequest [card-request {:moderated_item_type :card :moderated_item_id card-id}]
                    ModerationRequest [dashboard-request {:moderated_item_type :dashboard :moderated_item_id dashboard-id}]]
      (is (= [card dashboard]
             (map :moderated_item (mreq/add-moderated-items [card-request dashboard-request])))))))
