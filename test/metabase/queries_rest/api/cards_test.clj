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

(deftest ^:parallel dashboards-for-cards-includes-series-only-test
  (testing "POST /api/cards/dashboards reports a dashboard where the card appears only as a dashcard series"
    (mt/with-temp [:model/Card series-card {}
                   :model/Card primary-card {}
                   :model/Dashboard {dash-id :id dash-name :name} {}
                   :model/DashboardCard dc {:card_id (:id primary-card) :dashboard_id dash-id}
                   :model/DashboardCardSeries _ {:dashboardcard_id (:id dc) :card_id (:id series-card) :position 0}]
      (is (= [{:card_id (:id series-card)
               :dashboards [{:id dash-id :name dash-name}]}]
             (mt/user-http-request :rasta :post 200 "cards/dashboards" {:card_ids [(:id series-card)]}))))))

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
    (let [counted (fn [card-ids]
                    (t2/with-call-count [call-count]
                      (mt/user-http-request :rasta :post 200 "cards/dashboards" {:card_ids card-ids})
                      (call-count)))]
      (counted [c1])
      (is (= (counted [c1])
             (counted [c1 c2 c3 c4 c5 c6 c7 c8 c9 c10]))))))

(defn- insert-cards!
  "The ids of `n` new Cards in the Collection `collection-id`."
  [n collection-id]
  (mapv (fn [i]
          (t2/insert-returning-pk! :model/Card
                                   (merge (mt/with-temp-defaults :model/Card)
                                          {:name (str "moving " i) :collection_id collection-id})))
        (range n)))

(defn- insert-dashboard!
  "The id of a new Dashboard in the Collection `collection-id`."
  [collection-id]
  (t2/insert-returning-pk! :model/Dashboard
                           (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id collection-id})))

(deftest move-cards-to-collection-statement-count-test
  (testing "POST /api/cards/move to a collection takes as many statements for many Cards as for few"
    (mt/with-temp [:model/Collection {from-id :id} {}
                   :model/Collection {to-id :id}   {}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) from-id)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) to-id)
      (mt/with-model-cleanup [:model/Card]
        (let [move! (fn [n]
                      (let [ids (insert-cards! n from-id)]
                        (t2/with-call-count [call-count]
                          (mt/user-http-request :rasta :post 200 "cards/move" {:card_ids ids :collection_id to-id})
                          (is (= #{to-id} (t2/select-fn-set :collection_id :model/Card :id [:in ids])))
                          (call-count))))]
          (move! 2)
          (let [few  (move! 10)
                many (move! 40)]
            (is (= few many))))))))

(deftest move-cards-to-dashboard-statement-count-test
  (testing "POST /api/cards/move to a dashboard takes as many statements for many Cards as for few"
    (mt/with-temp [:model/Collection {from-id :id} {}
                   :model/Collection {to-id :id}   {}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) from-id)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) to-id)
      (mt/with-model-cleanup [:model/Card :model/Dashboard]
        (let [move! (fn [n]
                      (let [ids          (insert-cards! n from-id)
                            dashboard-id (insert-dashboard! to-id)
                            count-before (t2/count :model/DashboardCard :dashboard_id dashboard-id)]
                        (t2/with-call-count [call-count]
                          (mt/user-http-request :rasta :post 200 "cards/move" {:card_ids ids :dashboard_id dashboard-id})
                          (is (= #{dashboard-id} (t2/select-fn-set :dashboard_id :model/Card :id [:in ids])))
                          (is (= (+ count-before n) (t2/count :model/DashboardCard :dashboard_id dashboard-id)))
                          (call-count))))]
          (move! 2)
          (let [few  (move! 10)
                many (move! 40)]
            (is (= few many))))))))

(deftest move-cards-leaving-dashboards-statement-count-test
  (testing "POST /api/cards/move takes the Cards off the Dashboards they leave with as many statements for many as for few"
    (mt/with-temp [:model/Collection {from-id :id} {}
                   :model/Collection {to-id :id}   {}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) from-id)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) to-id)
      (mt/with-model-cleanup [:model/Card :model/Dashboard]
        (let [move! (fn [n]
                      (let [ids          (insert-cards! n from-id)
                            dashboard-id (insert-dashboard! from-id)
                            _            (t2/insert! :model/DashboardCard
                                                     (mapv #(merge (mt/with-temp-defaults :model/DashboardCard)
                                                                   {:card_id % :dashboard_id dashboard-id})
                                                           ids))
                            dest-id      (insert-dashboard! to-id)]
                        (t2/with-call-count [call-count]
                          (mt/user-http-request :rasta :post 200 "cards/move" {:card_ids ids :dashboard_id dest-id})
                          (is (= #{dest-id} (t2/select-fn-set :dashboard_id :model/DashboardCard :card_id [:in ids])))
                          (call-count))))]
          (move! 2)
          (let [few  (move! 10)
                many (move! 40)]
            (is (= few many))))))))

(deftest dashboards-of-cards-statement-count-test
  (testing "POST /api/cards/dashboards takes as many statements for Cards on many Dashboards as for few"
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
      (mt/with-model-cleanup [:model/Card :model/Dashboard]
        (let [counted (fn [n]
                        (let [ids (insert-cards! n coll-id)]
                          (doseq [id ids]
                            (t2/insert! :model/DashboardCard
                                        (merge (mt/with-temp-defaults :model/DashboardCard)
                                               {:card_id id :dashboard_id (insert-dashboard! coll-id)})))
                          (t2/with-call-count [call-count]
                            (let [response (mt/user-http-request :rasta :post 200 "cards/dashboards" {:card_ids ids})]
                              (is (= (repeat n 1) (map (comp count :dashboards) response))))
                            (call-count))))]
          (counted 2)
          (let [few  (counted 10)
                many (counted 40)]
            (is (= few many))))))))
