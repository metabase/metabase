(ns metabase-enterprise.database-routing.models-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.models :as database-routing.models]
   [metabase-enterprise.database-routing.schema :as database-routing.schema]
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
                  :details  {:db_routing "enabled" :routing_attribute "tenant"}
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
        (testing "deleting a router is recorded as an update of its database"
          (database-routing.models/delete-database-routers! [(t2/select-one-pk :model/DatabaseRouter :database_id db-id)])
          (is (= {:model_id db-id
                  :user_id  (mt/user->id :crowberto)
                  :details  {:db_routing "disabled"}
                  :topic    :database-update
                  :model    "Database"}
                 (mt/latest-audit-log-entry :database-update db-id))))
        (testing "a write without a change records nothing"
          (database-routing.models/create-database-routers! [{:database_id db-id :user_attribute "tenant"}])
          (let [before (t2/count :model/AuditLog)]
            (database-routing.models/update-database-routers! [{:id (t2/select-one-pk :model/DatabaseRouter :database_id db-id) :user_attribute "tenant"}])
            (is (= before (t2/count :model/AuditLog))))
          (database-routing.models/delete-database-routers! [(t2/select-one-pk :model/DatabaseRouter :database_id db-id)]))))))
