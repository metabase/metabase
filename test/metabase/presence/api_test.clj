(ns metabase.presence.api-test
  "POC tests for /api/presence/ping."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest ping-creates-and-returns-others-test
  (mt/initialize-if-needed! :db)
  (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Presence Dash"}]
    (testing "First ping returns empty viewer list and creates a row"
      (let [resp (mt/user-http-request :rasta :post 200 "presence/ping"
                                       {:model "dashboard" :model_id dash-id})]
        (is (= [] (:viewers resp)))
        (is (t2/exists? :model/UserPresence
                        :user_id  (mt/user->id :rasta)
                        :model    "dashboard"
                        :model_id dash-id))))
    (testing "Another user pinging the same dashboard sees the first user"
      (let [resp (mt/user-http-request :crowberto :post 200 "presence/ping"
                                       {:model "dashboard" :model_id dash-id})
            viewer-ids (set (map :id (:viewers resp)))]
        (is (contains? viewer-ids (mt/user->id :rasta))
            "crowberto should see rasta in the viewer list")
        (is (not (contains? viewer-ids (mt/user->id :crowberto)))
            "the caller should not appear in their own viewer list")))
    (testing "Subsequent ping by the same user updates last_seen_at instead of inserting"
      (mt/user-http-request :rasta :post 200 "presence/ping"
                            {:model "dashboard" :model_id dash-id})
      (is (= 1
             (count (t2/select :model/UserPresence
                               :user_id (mt/user->id :rasta)
                               :model "dashboard"
                               :model_id dash-id)))))))

(deftest leave-clears-row-test
  (mt/initialize-if-needed! :db)
  (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Presence Dash 2"}]
    (mt/user-http-request :rasta :post 200 "presence/ping"
                          {:model "dashboard" :model_id dash-id})
    (is (t2/exists? :model/UserPresence
                    :user_id  (mt/user->id :rasta)
                    :model    "dashboard"
                    :model_id dash-id))
    (mt/user-http-request :rasta :post 204 "presence/leave"
                          {:model "dashboard" :model_id dash-id})
    (is (not (t2/exists? :model/UserPresence
                         :user_id  (mt/user->id :rasta)
                         :model    "dashboard"
                         :model_id dash-id)))))

(deftest expired-rows-are-excluded-test
  (mt/initialize-if-needed! :db)
  (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Presence Dash 3"}]
    ;; Seed a stale row for crowberto and a fresh one for rasta via the endpoint.
    (mt/user-http-request :rasta :post 200 "presence/ping"
                          {:model "dashboard" :model_id dash-id})
    (t2/insert! :model/UserPresence
                {:user_id      (mt/user->id :crowberto)
                 :model        "dashboard"
                 :model_id     dash-id
                 :last_seen_at (java.time.OffsetDateTime/now)
                 :expires_at   (.minusMinutes (java.time.OffsetDateTime/now) 5)})
    (let [resp (mt/user-http-request :lucky :post 200 "presence/ping"
                                     {:model "dashboard" :model_id dash-id})
          viewer-ids (set (map :id (:viewers resp)))]
      (is (contains? viewer-ids (mt/user->id :rasta)))
      (is (not (contains? viewer-ids (mt/user->id :crowberto)))
          "expired row should not appear in the viewer list"))))

(deftest permission-required-test
  (mt/initialize-if-needed! :db)
  (testing "Pinging an entity in a collection without read access is forbidden"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard  {dash-id :id} {:collection_id coll-id}]
        (mt/user-http-request :rasta :post 403 "presence/ping"
                              {:model "dashboard" :model_id dash-id})
        (is (not (t2/exists? :model/UserPresence
                             :user_id  (mt/user->id :rasta)
                             :model    "dashboard"
                             :model_id dash-id)))))))

(comment
  ;; for quick local exec
  (u/ignore-exceptions))
