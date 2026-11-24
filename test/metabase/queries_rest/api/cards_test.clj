(ns metabase.queries-rest.api.cards-test
  (:require
   [clojure.test :refer :all]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
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

(deftest move-cards-first-failure-decides-test
  (testing "POST /api/cards/move answers with the refusal of the first Card in request order, as moving them one by one did"
    (mt/with-temp [:model/Collection {coll-id :id}      {}
                   :model/Collection {locked-id :id}    {}
                   :model/Card       {writable :id}     {}
                   :model/Card       {unwritable :id}   {:collection_id coll-id}
                   :model/Card       {in-locked :id}    {}
                   :model/Dashboard  {locked-dash :id}  {:collection_id locked-id}
                   :model/DashboardCard _               {:card_id in-locked :dashboard_id locked-dash}
                   :model/Dashboard  {dest-dash-id :id} {}]
      (perms/revoke-collection-permissions! (perms-group/all-users) coll-id)
      (perms/revoke-collection-permissions! (perms-group/all-users) locked-id)
      (let [missing 2147483647
            move!   (fn [status card-ids]
                      (mt/user-http-request :rasta :post status "cards/move" {:card_ids card-ids :dashboard_id dest-dash-id}))]
        (testing "unwritable first, missing second"
          (is (= "You don't have permissions to do that."
                 (move! 403 [unwritable missing]))))
        (testing "missing first, unwritable second"
          (is (= "Not found."
                 (move! 404 [missing unwritable]))))
        (testing "writable first, missing second"
          (is (= "Not found."
                 (move! 404 [writable missing]))))
        (testing "refused by its Dashboard first, missing second"
          (is (= "You don't have permissions to do that."
                 (move! 403 [in-locked missing]))))
        (testing "missing first, refused by its Dashboard second"
          (is (= "Not found."
                 (move! 404 [missing in-locked]))))
        (testing "refused by its Dashboard first, unwritable second, then the other way round"
          (is (= "You don't have permissions to do that."
                 (move! 403 [in-locked unwritable])))
          (is (= "You don't have permissions to do that."
                 (move! 403 [unwritable in-locked]))))
        (is (= #{nil} (t2/select-fn-set :dashboard_id :model/Card :id [:in [writable unwritable in-locked]])))))))

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

(defn- position-by-name
  "The `collection_position` by name of the Cards in the Collection `collection-id`."
  [collection-id]
  (t2/select-fn->fn :name :collection_position :model/Card :collection_id collection-id))

(deftest move-pinned-cards-refuses-unwritable-card-test
  (testing "POST /api/cards/move moves nothing when one of the pinned Cards is in a Collection that is not writable"
    (mt/with-temp [:model/Collection {writable :id}  {}
                   :model/Collection {read-only :id} {}
                   :model/Collection {to-id :id}     {}
                   :model/Card       a {:name "a" :collection_id writable :collection_position 1}
                   :model/Card       _ {:name "b" :collection_id writable :collection_position 2}
                   :model/Card       c {:name "c" :collection_id read-only :collection_position 1}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable)
      (perms/grant-collection-read-permissions! (perms-group/all-users) read-only)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) to-id)
      (mt/user-http-request :rasta :post 403 "cards/move" {:card_ids [(:id a) (:id c)] :collection_id to-id})
      (is (= {"a" 1 "b" 2} (position-by-name writable)))
      (is (= {"c" 1} (position-by-name read-only)))
      (is (= {} (position-by-name to-id))))))

(defn- insert-pinned-cards!
  "The ids of `n` new Cards in the Collection `collection-id`, with the positions 1 to `n`."
  [n collection-id]
  (mapv (fn [i]
          (t2/insert-returning-pk! :model/Card
                                   (merge (mt/with-temp-defaults :model/Card)
                                          {:name (str "pinned " i) :collection_id collection-id :collection_position (inc i)})))
        (range n)))

(deftest move-pinned-cards-statement-count-test
  (testing "POST /api/cards/move takes at most 3 statements more per pinned Card, for the position that differs from card to card, however many Cards"
    (mt/with-temp [:model/Collection {to-id :id} {}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) to-id)
      (mt/with-model-cleanup [:model/Card :model/Dashboard :model/Collection]
        (doseq [[where destination] [["a Collection" (fn [] {:collection_id to-id})]
                                     ["a Dashboard" (fn [] {:dashboard_id (insert-dashboard! to-id)})]]]
          (testing where
            (let [move! (fn [n]
                          (let [from-id (t2/insert-returning-pk! :model/Collection
                                                                 (merge (mt/with-temp-defaults :model/Collection)
                                                                        {:name (str "from " (random-uuid))}))
                                _       (perms/grant-collection-readwrite-permissions! (perms-group/all-users) from-id)
                                ids     (insert-pinned-cards! n from-id)
                                body    (assoc (destination) :card_ids ids)]
                            (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card)
                                                           {:name "staying" :collection_id from-id :collection_position (inc n)}))
                            (events.tu/real-statement-count!
                             #(mt/user-http-request :rasta :post 200 "cards/move" body))))]
              (move! 2)
              (let [few  (move! 10)
                    many (move! 40)]
                (is (<= (- many few) (* 3 (- 40 10))))))))))))

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

(defn- count-events-by-topic!
  "Call `thunk` with the events it publishes delivered as usual, and return the number of events of each topic."
  [thunk]
  (let [published (atom {})
        publish!  events/publish-event!]
    (with-redefs [events/publish-event! (fn [topic event]
                                          (swap! published update topic (fnil inc 0))
                                          (publish! topic event))]
      (thunk))
    @published))

(deftest ^:synchronous move-dashboard-questions-off-dashboards-audit-test
  (testing "POST /api/cards/move of dashboard questions of many Dashboards publishes one event and takes as many statements as for few, with one audit row for each Dashboard"
    (mt/with-premium-features #{:audit-app}
      (mt/user-http-request :rasta :get 200 "user/current")
      (mt/with-temp [:model/Collection {from-id :id} {}
                     :model/Collection {to-id :id}   {}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) from-id)
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) to-id)
        (mt/with-model-cleanup [:model/Card :model/Dashboard :model/AuditLog]
          (let [move! (fn [n]
                        (let [dashboard-ids (vec (repeatedly n #(insert-dashboard! from-id)))
                              card-ids      (mapv (fn [dashboard-id]
                                                    (t2/insert-returning-pk! :model/Card
                                                                             (merge (mt/with-temp-defaults :model/Card)
                                                                                    {:name "leaving" :collection_id from-id :dashboard_id dashboard-id})))
                                                  dashboard-ids)
                              _             (t2/insert! :model/DashboardCard
                                                        (mapv #(merge (mt/with-temp-defaults :model/DashboardCard)
                                                                      {:card_id %1 :dashboard_id %2})
                                                              card-ids dashboard-ids))
                              dest-id       (insert-dashboard! to-id)
                              topics        (atom nil)
                              statements    (events.tu/real-statement-count!
                                             (fn []
                                               (reset! topics (count-events-by-topic!
                                                               #(mt/user-http-request :rasta :post 200 "cards/move"
                                                                                      {:card_ids card-ids :dashboard_id dest-id})))))]
                          (is (= #{dest-id} (t2/select-fn-set :dashboard_id :model/Card :id [:in card-ids])))
                          (is (= 1 (get @topics :event/dashboard-remove-cards)))
                          (is (= 1 (get @topics :event/dashboard-add-cards)))
                          (is (= n (t2/count :model/AuditLog :topic "dashboard-remove-cards" :model "Dashboard" :model_id [:in dashboard-ids])))
                          statements))]
            (move! 2)
            (let [few  (move! 2)
                  many (move! 6)]
              (is (= few many)))))))))

(deftest ^:synchronous leave-dashboards-audit-test
  (testing "archiving a dashboard question and moving dashboard questions to a Collection publish one remove event with an audit row for each Dashboard"
    (mt/with-premium-features #{:audit-app}
      (mt/user-http-request :rasta :get 200 "user/current")
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id)
        (mt/with-model-cleanup [:model/Card :model/Dashboard :model/AuditLog]
          (let [dashboard-question! (fn []
                                      (let [dashboard-id (insert-dashboard! coll-id)
                                            card-id      (t2/insert-returning-pk! :model/Card
                                                                                  (merge (mt/with-temp-defaults :model/Card)
                                                                                         {:name "leaving" :collection_id coll-id :dashboard_id dashboard-id}))]
                                        (t2/insert! :model/DashboardCard (merge (mt/with-temp-defaults :model/DashboardCard)
                                                                                {:card_id card-id :dashboard_id dashboard-id}))
                                        [card-id dashboard-id]))
                removals            (fn [request]
                                      (let [[[card-id dashboard-id] & others :as pairs] (repeatedly 3 dashboard-question!)
                                            topics (count-events-by-topic! #(request card-id (mapv first pairs)))]
                                        {:events (get topics :event/dashboard-remove-cards)
                                         :audit  (t2/count :model/AuditLog :topic "dashboard-remove-cards" :model "Dashboard"
                                                           :model_id [:in (conj (mapv second others) dashboard-id)])}))]
            (testing "archive"
              (is (= {:events 1 :audit 1}
                     (removals (fn [card-id _] (mt/user-http-request :rasta :put 200 (str "card/" card-id) {:archived true}))))))
            (testing "move to a Collection"
              (is (= {:events 1 :audit 3}
                     (removals (fn [_ card-ids]
                                 (mt/user-http-request :rasta :post 200 "cards/move" {:card_ids card-ids :collection_id coll-id :dashboard_id nil}))))))))))))

(deftest ^:synchronous add-dashcards-to-dashboards-audit-test
  (testing "adding dashcards to many Dashboards publishes one event and takes as many statements as for few, with one audit row for each Dashboard"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (mt/with-model-cleanup [:model/Card :model/Dashboard :model/AuditLog]
          (let [add! (fn [n]
                       (let [dashboard-ids (vec (repeatedly n #(insert-dashboard! coll-id)))
                             card-ids      (insert-cards! n coll-id)
                             rows          (mapv (fn [dashboard-id card-id]
                                                   {:dashboard_id dashboard-id :card_id card-id
                                                    :row 0 :col 0 :size_x 4 :size_y 4})
                                                 dashboard-ids card-ids)
                             topics        (atom nil)
                             statements    (events.tu/real-statement-count!
                                            (fn []
                                              (mt/with-test-user :rasta
                                                (reset! topics (count-events-by-topic!
                                                                #(dashboard/add-dashcards! rows))))))]
                         (is (= 1 (get @topics :event/dashboard-add-cards)))
                         (is (= n (t2/count :model/AuditLog :topic "dashboard-add-cards" :model "Dashboard" :model_id [:in dashboard-ids])))
                         statements))]
            (add! 2)
            (let [few  (add! 2)
                  many (add! 6)]
              (is (= few many)))))))))
