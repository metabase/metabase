(ns metabase-enterprise.database-routing.models-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.schema :as database-routing.schema]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest router-needs-user-attribute-test
  (testing "a router routes on a non-blank user attribute"
    (doseq [user-attribute [nil "" " "]]
      (is (not (mr/validate ::database-routing.schema/database-router.update {:user_attribute user-attribute}))))
    (is (mr/validate ::database-routing.schema/database-router.update {:user_attribute "tenant"}))))

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
           (t2/insert! :model/DatabaseRouter {:database_id dest-id :user_attribute "tenant"})))
      (is (pos? (t2/insert! :model/DatabaseRouter {:database_id router-db-id :user_attribute "tenant"})))
      (t2/delete! :model/DatabaseRouter :database_id router-db-id))))
