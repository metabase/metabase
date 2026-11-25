(ns metabase-enterprise.database-routing.models-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.models :as database-routing.models]
   [metabase-enterprise.database-routing.schema :as database-routing.schema]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest router-needs-user-attribute-test
  (testing "a router routes on a non-blank user attribute"
    (doseq [user-attribute [nil "" " "]]
      (is (not (mr/validate ::database-routing.schema/database-router.update {:id 1 :user_attribute user-attribute}))))
    (is (mr/validate ::database-routing.schema/database-router.update {:id 1 :user_attribute "tenant"}))))

(deftest router-database-is-frozen-test
  (testing "a router stays with the database it was made for"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Database {other-id :id} {}
                   :model/DatabaseRouter {router-id :id} {:database_id db-id :user_attribute "tenant"}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"You cannot change the database of a router"
           (t2/update! :model/DatabaseRouter :id router-id {:database_id other-id}))))))

(deftest destination-cannot-be-router-test
  (testing "a destination database cannot be made a router"
    (mt/with-temp [:model/Database {router-db-id :id} {}
                   :model/Database {dest-id :id} {:router_database_id router-db-id}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Cannot make a destination database a router database"
           (database-routing.models/create-database-routers! [{:database_id dest-id :user_attribute "tenant"}])))
      (is (seq (database-routing.models/create-database-routers! [{:database_id router-db-id :user_attribute "tenant"}])))
      (t2/delete! :model/DatabaseRouter :database_id router-db-id))))

(deftest database-router-events-test
  (mt/with-premium-features #{:audit-app :database-routing}
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2 :details (:details (mt/db)) :name "Routed"}]
      (mt/with-current-user (mt/user->id :crowberto)
        (database-routing.models/create-database-routers! [{:database_id db-id :user_attribute "tenant"}])
        (testing "creating a router is recorded as an update of its database"
          (is (= {:model_id db-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:db_routing "enabled" :routing_attribute "tenant" :anonymous_access_granted false}
                  :topic    :database-update
                  :model    "Database"}
                 (mt/latest-audit-log-entry :database-update db-id))))
        (testing "changing the attribute of a router is recorded as an update of its database with the change"
          (database-routing.models/update-database-routers! [{:id (t2/select-one-pk :model/DatabaseRouter :database_id db-id) :user_attribute "other"}])
          (is (= {:model_id db-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:db_routing "enabled"
                             :previous   {:routing_attribute "tenant"}
                             :new        {:routing_attribute "other"}}
                  :topic    :database-update
                  :model    "Database"}
                 (mt/latest-audit-log-entry :database-update db-id))))
        (testing "changing only the anonymous access grant of a router is recorded with the previous and new values"
          (database-routing.models/update-database-routers! [{:id (t2/select-one-pk :model/DatabaseRouter :database_id db-id) :anonymous_access_granted true}])
          (is (= {:model_id db-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:db_routing "enabled"
                             :previous   {:anonymous_access_granted false}
                             :new        {:anonymous_access_granted true}}
                  :topic    :database-update
                  :model    "Database"}
                 (mt/latest-audit-log-entry :database-update db-id))))
        (testing "deleting a router is recorded as an update of its database"
          (database-routing.models/delete-database-routers! [(t2/select-one-pk :model/DatabaseRouter :database_id db-id)])
          (is (= {:model_id db-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:db_routing "disabled" :anonymous_access_granted true}
                  :topic    :database-update
                  :model    "Database"}
                 (mt/latest-audit-log-entry :database-update db-id))))
        (testing "a write without a change records nothing"
          (database-routing.models/create-database-routers! [{:database_id db-id :user_attribute "tenant"}])
          (let [before (t2/count :model/AuditLog)]
            (database-routing.models/update-database-routers! [{:id (t2/select-one-pk :model/DatabaseRouter :database_id db-id) :user_attribute "tenant"}])
            (is (= before (t2/count :model/AuditLog))))
          (database-routing.models/delete-database-routers! [(t2/select-one-pk :model/DatabaseRouter :database_id db-id)]))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Database {db-1 :id} {}
                 :model/Database {db-2 :id} {}
                 :model/Database {db-3 :id} {}
                 :model/Database {db-4 :id} {}
                 :model/Database {db-5 :id} {}
                 :model/Database {db-6 :id} {}]
    (let [measure (fn [n]
                    (let [db-ids  (take n [db-1 db-2 db-3 db-4 db-5 db-6])
                          routers (atom nil)
                          create  (events.tu/statement-count!
                                   #(reset! routers (database-routing.models/create-database-routers!
                                                     (mapv (fn [db-id] {:database_id db-id :user_attribute "tenant"}) db-ids))))
                          rename! #(database-routing.models/update-database-routers!
                                    (mapv (fn [{:keys [id]}] {:id id :user_attribute "region"}) %))
                          _       (rename! (take-nth 2 @routers))
                          update  (events.tu/statement-count! #(rename! @routers))
                          delete  (events.tu/statement-count!
                                   #(database-routing.models/delete-database-routers! (mapv :id @routers)))]
                      {:create create :update update :delete delete}))]
      (testing "creating, updating some routers that already route on the new attribute, and deleting"
        (measure 1)
        (is (= (measure 2) (measure 6)))))))

(deftest create-database-routers-refuses-destinations-test
  (mt/with-temp [:model/Database {router-db-id :id}      {}
                 :model/Database {other-db-id :id}       {}
                 :model/Database {destination-db-id :id} {:router_database_id router-db-id}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot make a destination database a router database"
                          (database-routing.models/create-database-routers!
                           [{:database_id other-db-id :user_attribute "tenant"}
                            {:database_id destination-db-id :user_attribute "tenant"}])))
    (is (not (t2/exists? :model/DatabaseRouter :database_id other-db-id)))))

(deftest update-database-routers-refuses-in-input-order-test
  (mt/with-temp [:model/Database       {db-id :id}     {}
                 :model/Database       {other-id :id}  {}
                 :model/DatabaseRouter {router-id :id} {:database_id db-id :user_attribute "tenant"}]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"You cannot change the database of a router"
                          (database-routing.models/update-database-routers!
                           [{:id router-id :user_attribute "region"}
                            {:id router-id :database_id other-id}])))
    (is (= "tenant" (t2/select-one-fn :user_attribute :model/DatabaseRouter :id router-id)))
    (is (nil? (database-routing.models/update-database-routers! [{:id router-id :user_attribute "region"}
                                                                 {:id Integer/MAX_VALUE :user_attribute "region"}])))
    (is (= "region" (t2/select-one-fn :user_attribute :model/DatabaseRouter :id router-id)))))

(deftest create-database-routers-refuses-any-batch-with-destination-test
  (mt/with-temp [:model/Database {plain-db :id}       {}
                 :model/Database {other-db :id}       {}
                 :model/Database {router-db :id}      {}
                 :model/Database {destination-db :id} {:router_database_id router-db}]
    (doseq [[database-ids expected] [[[plain-db] nil]
                                     [[destination-db] 400]
                                     [[plain-db other-db] nil]
                                     [[plain-db destination-db] 400]
                                     [[destination-db plain-db] 400]]]
      (t2/with-transaction [_conn nil {:rollback-only true}]
        (let [rows    (mapv #(hash-map :database_id % :user_attribute "tenant") database-ids)
              refusal (try
                        (database-routing.models/create-database-routers! rows)
                        nil
                        (catch clojure.lang.ExceptionInfo e
                          (:status-code (ex-data e))))]
          (testing (pr-str database-ids)
            (is (= expected refusal))
            (is (= (nil? expected) (t2/exists? :model/DatabaseRouter :database_id [:in database-ids])))))))))
