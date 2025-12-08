(ns metabase.queries-rest.api.cards-test
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest dashboards-for-cards-works
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/Dashboard {dash-id :id
                                   dash-name :name} {}
                 :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}]
    (testing "just one card in one dashboard"
      (is (= [{:card_id card-id
               :dashboards [{:name dash-name :id dash-id}]}]
             (mt/user-http-request :rasta :post 200 "cards/dashboards" {:card_ids [card-id]}))))

    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {other-dash-id :id
                                     other-dash-name :name} {:collection_id coll-id}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id other-dash-id}]
      (testing "the card is in a dashboard we don't have permission to see"
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
        (is (= [{:card_id card-id
                 :dashboards #{{:name dash-name :id dash-id}
                               {:error "unreadable-dashboard"}}}]
               (->> (mt/user-http-request :rasta :post 200 "cards/dashboards" {:card_ids [card-id]})
                    (map #(update % :dashboards set))))))
      (testing "the card is in a dashboard we don't have permission to *write*, but we can see it"
        (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
        (is (= [{:card_id card-id
                 :dashboards #{{:name dash-name :id dash-id}
                               {:name other-dash-name :id other-dash-id :error "unwritable-dashboard"}}}]
               (->> (mt/user-http-request :rasta :post 200 "cards/dashboards" {:card_ids [card-id]})
                    (map #(update % :dashboards set)))))))))

(deftest ^:parallel bulk-move-endpoint-works
  (testing "a simple move"
    (mt/with-temp [:model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}
                   :model/Dashboard {dest-dash-id :id} {}]
      (mt/user-http-request :rasta :post 200 "cards/move" {:card_ids [card-id]
                                                           :dashboard_id dest-dash-id}))))

(deftest bulk-move-endpoint-works-2
  (testing "if we don't have permission on the card itself"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-id :id} {:collection_id coll-id}
                   :model/Dashboard {dest-dash-id :id} {}]
      (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
      (mt/user-http-request :rasta :post 403 "cards/move" {:card_ids [card-id]
                                                           :dashboard_id dest-dash-id}))))

(deftest bulk-move-endpoint-works-3
  (testing "if we don't have permission to remove the card from a dashboard it's already in"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card {card-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/DashboardCard _ {:card_id card-id :dashboard_id dash-id}
                   :model/Dashboard {dest-dash-id :id} {}]
      (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
      (mt/user-http-request :rasta :post 403 "cards/move" {:card_ids [card-id]
                                                           :dashboard_id dest-dash-id}))))

(deftest bulk-move-endpoint-works-4
  (testing "mixed permissions"
    (testing "permission on one card, but not another"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-1-id :id} {}
                     :model/Card {card-2-id :id} {:collection_id coll-id}
                     :model/Dashboard {dest-dash-id :id} {}]
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
        (mt/user-http-request :rasta :post 403 "cards/move" {:card_ids [card-1-id card-2-id]
                                                             :dashboard_id dest-dash-id})
        (is (= #{nil} (t2/select-fn-set :dashboard_id :model/Card :id [:in [card-1-id card-2-id]])))))))

(deftest bulk-move-endpoint-works-5
  (testing "mixed permissions"
    (testing "one card is in a dashboard you don't have permissions on"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card {card-1-id :id} {}
                     :model/Card {card-2-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/DashboardCard _ {:card_id card-1-id :dashboard_id dash-id}
                     :model/Dashboard {dest-dash-id :id} {}]
        (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
        (mt/user-http-request :rasta :post 403 "cards/move" {:card_ids [card-1-id card-2-id]
                                                             :dashboard_id dest-dash-id})
        (is (= #{nil} (t2/select-fn-set :dashboard_id :model/Card :id [:in [card-1-id card-2-id]])))))))

(deftest dashboards-for-cards-endpoint-has-no-n+1
  (mt/with-temp [:model/Card {c1 :id} {}
                 :model/Card {c2 :id} {}
                 :model/Card {c3 :id} {}
                 :model/Card {c4 :id} {}
                 :model/Card {c5 :id} {}
                 :model/Card {c6 :id} {}
                 :model/Card {c7 :id} {}
                 :model/Card {c8 :id} {}
                 :model/Card {c9 :id} {}
                 :model/Card {c10 :id} {}]
    (let [count1 (t2/with-call-count [c]
                   (mt/user-http-request :rasta :post 200 "cards/dashboards"
                                         {:card_ids [c1]})
                   (c))
          count2 (t2/with-call-count [c]
                   (mt/user-http-request :rasta :post 200 "cards/dashboards"
                                         {:card_ids [c1 c2 c3 c4 c5 c6 c7 c8 c9 c10]})
                   (c))]
      ;; in practice these should be equal but we'll provide a little wiggle room
      (is (< count2 (* 2 count1))))))
