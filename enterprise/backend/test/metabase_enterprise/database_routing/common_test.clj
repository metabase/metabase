(ns metabase-enterprise.database-routing.common-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->destination-db-id]]
   [metabase.api.common :as api]
   [metabase.test :as mt]))

;; Tests for database routing functionality, specifically verifying that guest embedding 
;; works correctly with database routing by allowing anonymous users to use the router database.
;; This enables guest embeds to work with databases that have routing enabled.

(deftest router-db-or-id->destination-db-id-test
  (mt/with-temp [:model/Database router-db {:name "Router DB"}
                 :model/DatabaseRouter _ {:database_id (:id router-db)
                                          :user_attribute "department"}
                 :model/Database dest-db {:name "Engineering DB"
                                          :router_database_id (:id router-db)}
                 :model/User user {:email "test@example.com"}]

    (testing "Anonymous users (guest embeds) should return nil to use router database"
      ;; Test the key guest embedding scenario: anonymous user should return nil
      (binding [api/*current-user-id* nil
                api/*current-user* (atom nil)
                api/*is-superuser?* false]
        (is (nil? (router-db-or-id->destination-db-id (:id router-db)))
            "Anonymous users should return nil to use the router database for guest embedding")))

    (testing "Authenticated users with user attribute should route to destination database"
      (binding [api/*current-user-id* (:id user)
                api/*current-user* (atom (assoc user :attributes {"department" "Engineering DB"}))
                api/*is-superuser?* false]
        (is (= (:id dest-db)
               (router-db-or-id->destination-db-id (:id router-db)))
            "Users with matching attributes should be routed to destination database")))

    (testing "Superusers without user attribute should return nil to use router database"
      (binding [api/*current-user-id* (:id user)
                api/*current-user* (atom (assoc user :attributes {}))
                api/*is-superuser?* true]
        (is (nil? (router-db-or-id->destination-db-id (:id router-db)))
            "Superusers should use router database when no user attribute is set")))

    (testing "Authenticated non-superusers without user attribute should get an error"
      (binding [api/*current-user-id* (:id user)
                api/*current-user* (atom (assoc user :attributes {}))
                api/*is-superuser?* false]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Required user attribute is missing"
             (router-db-or-id->destination-db-id (:id router-db)))
            "Non-superusers without attributes should get an error")))))