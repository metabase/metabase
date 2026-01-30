(ns metabase-enterprise.auxiliary-connections.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- aux-url [db-id]
  (format "ee/auxiliary-connections/%d/read-write-data" db-id))

(deftest post-update-event-has-correct-previous-object-test
  (testing "POST update publishes event with previous-object reflecting pre-update state (R2 bug fix)"
    (mt/with-premium-features #{:transforms}
      (mt/with-model-cleanup [:model/Database]
        (mt/with-temp [:model/Database parent-db {}]
          (let [create-resp (mt/user-http-request :crowberto :post 200
                                                  (format "ee/auxiliary-connections/%d/read-write-data" (:id parent-db))
                                                  {:name    "Write DB"
                                                   :details {:db "write.db"}})]
            (is (= "created" (:status create-resp)))
            (let [captured-events (atom [])]
              (with-redefs [events/publish-event! (fn [topic event]
                                                    (swap! captured-events conj {:topic topic :event event}))]
                (mt/user-http-request :crowberto :post 200
                                      (format "ee/auxiliary-connections/%d/read-write-data" (:id parent-db))
                                      {:name    "Updated Write DB"
                                       :details {:db "updated-write.db"}}))
              (let [update-events (filter #(= :event/database-update (:topic %)) @captured-events)]
                (is (= 1 (count update-events))
                    "Should publish exactly one database-update event")
                (when (seq update-events)
                  (let [{:keys [object previous-object]} (:event (first update-events))]
                    (is (= "Updated Write DB" (:name object))
                        "object should reflect the new state")
                    (is (= "Write DB" (:name previous-object))
                        "previous-object should reflect the old state, not the new state")))))))))))

(deftest get-returns-not-configured-test
  (testing "GET returns {:configured false} when no auxiliary connection exists"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (is (= {:configured false}
               (mt/user-http-request :crowberto :get 200 (aux-url db-id))))))))

(deftest post-creates-auxiliary-connection-test
  (testing "POST creates an auxiliary DB, links it to parent, returns :status :created"
    (mt/with-premium-features #{:transforms}
      (mt/with-model-cleanup [:model/Database]
        (mt/with-temp [:model/Database {db-id :id} {}]
          (let [resp (mt/user-http-request :crowberto :post 200 (aux-url db-id)
                                           {:name    "Write Connection"
                                            :details {:db "write.db"}})]
            (is (= "created" (:status resp)))
            (is (pos-int? (:database_id resp)))
            (testing "parent DB now has write_database_id set"
              (is (= (:database_id resp)
                     (t2/select-one-fn :write_database_id :model/Database :id db-id))))
            (testing "auxiliary DB record exists with correct attributes"
              (let [aux-db (t2/select-one :model/Database :id (:database_id resp))]
                (is (= "Write Connection" (:name aux-db)))
                (is (= {:db "write.db"} (:details aux-db)))
                (is (false? (:auto_run_queries aux-db)))
                (is (false? (:is_full_sync aux-db)))
                (is (false? (:is_on_demand aux-db)))))))))))

(deftest get-returns-configured-test
  (testing "GET returns {:configured true} with aux DB info, password stripped from details"
    (mt/with-premium-features #{:transforms}
      (mt/with-model-cleanup [:model/Database]
        (mt/with-temp [:model/Database {db-id :id} {}]
          (mt/user-http-request :crowberto :post 200 (aux-url db-id)
                                {:name    "Write Connection"
                                 :details {:db "write.db" :password "secret" :tunnel-pass "tp" :ssl-key-value "sk"}})
          (let [resp (mt/user-http-request :crowberto :get 200 (aux-url db-id))]
            (is (true? (:configured resp)))
            (is (pos-int? (:database_id resp)))
            (is (= "Write Connection" (:name resp)))
            (testing "sensitive fields stripped from details"
              (is (= {:db "write.db"} (:details resp))))))))))

(deftest post-updates-existing-auxiliary-connection-test
  (testing "POST on a DB that already has an auxiliary connection updates it"
    (mt/with-premium-features #{:transforms}
      (mt/with-model-cleanup [:model/Database]
        (mt/with-temp [:model/Database {db-id :id} {}]
          (let [create-resp (mt/user-http-request :crowberto :post 200 (aux-url db-id)
                                                  {:name    "Original"
                                                   :details {:db "original.db"}})
                update-resp (mt/user-http-request :crowberto :post 200 (aux-url db-id)
                                                  {:name    "Updated"
                                                   :details {:db "updated.db"}})]
            (is (= "created" (:status create-resp)))
            (is (= "updated" (:status update-resp)))
            (is (= (:database_id create-resp) (:database_id update-resp))
                "Should update the same auxiliary DB, not create a new one")
            (let [aux-db (t2/select-one :model/Database :id (:database_id update-resp))]
              (is (= "Updated" (:name aux-db)))
              (is (= {:db "updated.db"} (:details aux-db))))))))))

(deftest delete-removes-auxiliary-connection-test
  (testing "DELETE removes the link and deletes the auxiliary DB"
    (mt/with-premium-features #{:transforms}
      (mt/with-model-cleanup [:model/Database]
        (mt/with-temp [:model/Database {db-id :id} {}]
          (let [create-resp (mt/user-http-request :crowberto :post 200 (aux-url db-id)
                                                  {:name    "Write Connection"
                                                   :details {:db "write.db"}})
                aux-db-id   (:database_id create-resp)
                delete-resp (mt/user-http-request :crowberto :delete 200 (aux-url db-id))]
            (is (= "deleted" (:status delete-resp)))
            (testing "parent DB no longer has write_database_id"
              (is (nil? (t2/select-one-fn :write_database_id :model/Database :id db-id))))
            (testing "auxiliary DB record is deleted"
              (is (not (t2/exists? :model/Database :id aux-db-id))))))))))

(deftest delete-no-connection-returns-400-test
  (testing "DELETE returns 400 when no auxiliary connection is configured"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (mt/user-http-request :crowberto :delete 400 (aux-url db-id))))))

(deftest post-blocks-router-database-test
  (testing "POST returns 400 for a router database (has destinations pointing to it)"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database {router-db-id :id} {}
                     :model/Database _destination {:router_database_id router-db-id}]
        (is (= "Cannot configure auxiliary connection for a router database"
               (mt/user-http-request :crowberto :post 400 (aux-url router-db-id)
                                     {:name    "Write Connection"
                                      :details {:db "write.db"}})))))))

(deftest post-blocks-destination-database-test
  (testing "POST returns 400 for a destination database"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database {router-db-id :id} {}
                     :model/Database {dest-db-id :id} {:router_database_id router-db-id}]
        (is (= "Cannot configure auxiliary connection for a destination database"
               (mt/user-http-request :crowberto :post 400 (aux-url dest-db-id)
                                     {:name    "Write Connection"
                                      :details {:db "write.db"}})))))))

(deftest endpoints-require-superuser-test
  (testing "All auxiliary connection endpoints require superuser"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (testing "GET"
          (mt/user-http-request :rasta :get 403 (aux-url db-id)))
        (testing "POST"
          (mt/user-http-request :rasta :post 403 (aux-url db-id)
                                {:name    "Write Connection"
                                 :details {:db "write.db"}}))
        (testing "DELETE"
          (mt/user-http-request :rasta :delete 403 (aux-url db-id)))))))

(deftest invalid-type-returns-400-test
  (testing "Endpoints return 400 for an invalid connection type"
    (mt/with-premium-features #{:transforms}
      (mt/with-temp [:model/Database {db-id :id} {}]
        (mt/user-http-request :crowberto :get 400
                              (format "ee/auxiliary-connections/%d/bogus-type" db-id))))))
