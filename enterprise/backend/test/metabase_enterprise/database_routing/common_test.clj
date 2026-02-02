(ns metabase-enterprise.database-routing.common-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.common :refer [router-db-or-id->destination-db-id*]]
   [metabase.test :as mt]))

(deftest router-db-or-id->destination-db-id-test
  (testing "router-db-or-id->destination-db-id* function"
    (mt/with-temp [:model/Database router-db {:name "Router DB"}
                   :model/DatabaseRouter _ {:database_id (:id router-db)
                                            :user_attribute "department"}
                   :model/Database dest-db {:name "Engineering DB"
                                            :router_database_id (:id router-db)}]

      (testing "anonymous users (guest embeds) should return nil (use router database)"
        (is (nil? (router-db-or-id->destination-db-id*
                   true  ; is-anonymous-user?
                   {}    ; user-attributes (empty for anonymous)
                   false ; is-superuser?
                   (:id router-db)))))

      (testing "authenticated users with user attribute should route to destination database"
        (is (= (:id dest-db)
               (router-db-or-id->destination-db-id*
                false ; is-anonymous-user?
                {"department" "Engineering DB"} ; user-attributes
                false ; is-superuser?
                (:id router-db)))))

      (testing "authenticated users without user attribute should get an error"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Required user attribute is missing"
             (router-db-or-id->destination-db-id*
              false ; is-anonymous-user?
              {}    ; user-attributes (empty)
              false ; is-superuser?
              (:id router-db)))))

      (testing "superusers without user attribute should return nil (use router database)"
        (is (nil? (router-db-or-id->destination-db-id*
                   false ; is-anonymous-user?
                   {}    ; user-attributes (empty)
                   true  ; is-superuser?
                   (:id router-db)))))

      (testing "users with __METABASE_ROUTER__ value should return nil (use router database)"
        (is (nil? (router-db-or-id->destination-db-id*
                   false ; is-anonymous-user?
                   {"department" "__METABASE_ROUTER__"} ; user-attributes
                   false ; is-superuser?
                   (:id router-db))))))))