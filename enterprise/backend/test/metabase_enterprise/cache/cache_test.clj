(ns metabase-enterprise.cache.cache-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.query-processor.card :as qp.card]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn last-audit-event []
  (t2/select-one [:model/AuditLog :topic :user_id :model :model_id :details]
                 :topic :cache-config-update
                 {:order-by [[:id :desc]]}))

(deftest cache-config-test
  (mt/with-model-cleanup [:model/CacheConfig]
    (testing "Caching API"
      (mt/with-premium-features #{:cache-granular-controls :audit-app}
        (mt/with-temp [:model/Database      db     {}
                       :model/Collection    col1   {:name "col1"}
                       :model/Dashboard     dash1  {:name          "dash1"
                                                    :collection_id (:id col1)}
                       :model/Card          card1  {:name          "card1"
                                                    :database_id   (:id db)
                                                    :collection_id (:id col1)}
                       :model/Card          card2  {:name          "card2"
                                                    :database_id   (:id db)
                                                    :collection_id (:id col1)}
                       :model/Card          card3  {:name "card3"}]

          (testing "Access from regular users"
            (testing "No general access"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 "cache/"))))
            (testing "But have access to a separate (accessible to them) entities"
              (is (= {:data []}
                     (mt/user-http-request :rasta :get 200 "cache/"
                                           :model "question" :id (:id card1))))))

          (testing "Can configure root"
            (is (mt/user-http-request :crowberto :put 200 "cache/"
                                      {:model    "root"
                                       :model_id 0
                                       :strategy {:type "nocache" :name "root"}}))
            (is (=? {:data [{:model "root" :model_id 0}]}
                    (mt/user-http-request :crowberto :get 200 "cache/"
                                          :model "root")))
            (testing "Is audited"
              (is (=? {:topic    :cache-config-update
                       :user_id  (:id (mt/fetch-user :crowberto))
                       :model    "CacheConfig"
                       :model_id int?
                       :details  {:model     "root"
                                  :model-id  0
                                  ;; no check for old value in case you had something in appdb
                                  :new-value {:strategy "nocache" :config {:name "root"}}}}
                      (last-audit-event)))))

          (testing "Can configure others"
            (is (mt/user-http-request :crowberto :put 200 "cache/"
                                      {:model    "database"
                                       :model_id (:id db)
                                       :strategy {:type "nocache" :name "db"}}))
            (is (mt/user-http-request :crowberto :put 200 "cache/"
                                      {:model    "dashboard"
                                       :model_id (:id dash1)
                                       :strategy {:type "nocache" :name "dash"}}))
            (is (mt/user-http-request :crowberto :put 200 "cache/"
                                      {:model    "question"
                                       :model_id (:id card1)
                                       :strategy {:type "nocache" :name "card1"}})))

          (testing "HTTP responds with correct listings"
            (is (=? {:data [{:model "root" :model_id 0}]}
                    (mt/user-http-request :crowberto :get 200 "cache/")))
            (is (=? {:data [{:model "database" :model_id (:id db)}]}
                    (mt/user-http-request :crowberto :get 200 "cache/" {}
                                          :model :database)))
            (is (=? {:data [{:model "question" :model_id (:id card1)}]}
                    (mt/user-http-request :crowberto :get 200 "cache/" {}
                                          :model :question)))
            (is (=? {:data [{:model "dashboard" :model_id (:id dash1)}
                            {:model "question" :model_id (:id card1)}]}
                    (mt/user-http-request :crowberto :get 200 "cache/" {}
                                          :collection (:id col1) :model :dashboard :model :question))))

          (testing "We select correct config for something from a db"
            (testing "First card has own config"
              (is (=? {:type :nocache :name "card1"}
                      (:cache-strategy (#'qp.card/query-for-card card1 {} {} {} {}))))
              (is (=? {:type :nocache :name "card1"}
                      (:cache-strategy (#'qp.card/query-for-card card1 {} {} {} {:dashboard-id (u/the-id dash1)})))))
            (testing "Second card should hit database or dashboard cache"
              (is (=? {:type :nocache :name "db"}
                      (:cache-strategy (#'qp.card/query-for-card card2 {} {} {} {}))))
              (is (=? {:type :nocache :name "dash"}
                      (:cache-strategy (#'qp.card/query-for-card card2 {} {} {} {:dashboard-id (u/the-id dash1)})))))
            (testing "Third card targets other db and gets root config"
              (is (=? {:type :nocache :name "root"}
                      (:cache-strategy (#'qp.card/query-for-card card3 {} {} {} {}))))))

          (testing "It's possible to delete a configuration"
            (is (nil? (mt/user-http-request :crowberto :delete 204 "cache/"
                                            {:model    "database"
                                             :model_id (:id db)})))
            (testing "Listing for databases becomes empty"
              (is (=? {:data []}
                      (mt/user-http-request :crowberto :get 200 "cache/" {}
                                            :model :database))))
            (testing "And card2 gets root config"
              (is (=? {:type :nocache :name "root"}
                      (:cache-strategy (#'qp.card/query-for-card card2 {} {} {} {}))))))

          (testing "It's possible to use advanced cache strategies"
            (is (mt/user-http-request :crowberto :put 200 "cache/"
                                      {:model    "root"
                                       :model_id 0
                                       :strategy {:type     "schedule"
                                                  :schedule "0/2 * * * * ?"}}))))))))

(deftest invalidation-test
  (mt/with-model-cleanup [:model/CacheConfig
                          [:model/QueryCache :updated_at]]
    (mt/with-premium-features #{:cache-granular-controls :audit-app}
      (mt/with-temp [:model/Dashboard     dash           {}
                     :model/Card          {card1-id :id} {:database_id   (mt/id)
                                                          :dataset_query (mt/mbql-query venues {:order-by [[:asc $id]]
                                                                                                :limit    5})}
                     :model/Card          {card2-id :id} {:database_id   (mt/id)
                                                          :dataset_query (mt/mbql-query venues {:order-by [[:asc $id]]
                                                                                                :limit    5})}
                     :model/DashboardCard _              {:dashboard_id (:id dash)
                                                          :card_id      card1-id}
                     :model/CacheConfig   _              {:model          "database"
                                                          :model_id       (mt/id)
                                                          :strategy       "schedule"
                                                          :config         {:schedule "0 * * * * ?"}
                                                          :invalidated_at (t/offset-date-time)}
                     :model/CacheConfig   _              {:model          "dashboard"
                                                          :model_id       (:id dash)
                                                          :strategy       "schedule"
                                                          :config         {:schedule "0 * * * * ?"}
                                                          :invalidated_at (t/offset-date-time)}]
        (let [run-query!  (fn [card-id & params]
                           (-> (apply mt/user-http-request :crowberto :post 202 (format "card/%d/query" card-id) params)
                               (select-keys [:cached])))
              invalidate! (fn [status & args]
                            (apply mt/user-http-request :crowberto :post status "cache/invalidate" args))]

          (is (=? {:data [{:model "database" :model_id (mt/id)}]}
                  (mt/user-http-request :crowberto :get 200 "cache/"
                                        :model "database")))

            (testing "making a query will cache it"
              (is (=? {:cached nil :data some?}
                      (run-query! card1-id)))
              (is (=? {:cached some? :data some?}
                      (run-query! card1-id)))
              (is (=? {:cached some? :data some?}
                      (run-query! card2-id))))

            (testing "invalidation drops cache only for affected card"
              (is (=? {:count 1}
                      (invalidate! 200 :question card2-id :include :overrides)))
              (is (=? {:cached some? :data some?}
                      (run-query! card1-id)))
              (is (=? {:cached nil :data some?}
                      (run-query! card2-id))))

            (testing "but invalidating a whole config drops cache for any affected card"
              (doseq [card-id [card1-id card2-id]]
                (is (=? {:count 1}
                        (invalidate! 200 :database (mt/id))))
                (is (=? {:cached nil :data some?}
                        (run-query! card-id {:ignore_cache true})))))

            (testing "when invalidating database config directly, dashboard-related queries are still cached"
              (is (=? {:count 1}
                      (invalidate! 200 :database (mt/id))))
              (is (=? {:cached some? :data some?}
                      (run-query! card1-id {:dashboard_id (:id dash)}))))

            (testing "but with overrides - will go through every card and mark cache invalidated"
              ;; not a concrete number here since (mt/id) can have a bit more than 2 cards we've currently defined
              (is (=? {:count pos-int?}
                      (invalidate! 200 :include :overrides :database (mt/id))))
              (is (=? {:cached nil :data some?}
                      (run-query! card1-id {:dashboard_id (:id dash)})))))))))
