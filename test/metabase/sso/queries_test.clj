(ns metabase.sso.queries-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.sso.queries :as sso.queries]
   [metabase.test :as mt]))

(deftest auth-identity-exists?-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/AuthIdentity _ {:user_id user-id :provider "password" :provider_id "U123"
                                        :credentials {:password_hash "h" :password_salt "s"}}]
    (testing "the provider is compared as a value"
      (is (sso.queries/auth-identity-exists? user-id "password"))
      (is (not (sso.queries/auth-identity-exists? user-id "ldap"))))
    (testing "a provider that looks like SQL matches nothing rather than being compiled"
      (is (not (sso.queries/auth-identity-exists? user-id "password' OR '1'='1"))))))

(deftest user-group-ids-excluding-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/PermissionsGroup {g1 :id} {}
                 :model/PermissionsGroup {g2 :id} {}]
    (perms/add-users-to-groups! [{:user user-id :group g1}
                                 {:user user-id :group g2}])
    (testing "returns the user's groups minus the excluded ones"
      ;; every user is also in the all-users group, so compare only the groups this test controls
      (is (= #{g1 g2} (set/intersection #{g1 g2} (sso.queries/user-group-ids-excluding user-id #{}))))
      (is (= #{g1} (set/intersection #{g1 g2} (sso.queries/user-group-ids-excluding user-id #{g2})))))
    (testing "an empty exclusion set excludes nothing rather than everything"
      ;; regression: non-empty-in would bind NULL here, and `x NOT IN (NULL)` is NULL under SQL
      ;; three-valued logic, so every row was filtered out. non-empty-not-in binds 0 instead.
      (is (set/subset? #{g1 g2} (sso.queries/user-group-ids-excluding user-id #{}))))))

(deftest user-group-ids-among-test
  (mt/with-temp [:model/User {user-id :id} {}
                 :model/PermissionsGroup {g1 :id} {}
                 :model/PermissionsGroup {g2 :id} {}
                 :model/PermissionsGroup {g3 :id} {}]
    (perms/add-users-to-groups! [{:user user-id :group g1}
                                 {:user user-id :group g2}])
    (testing "intersects membership with the candidate set"
      (is (= #{g1} (sso.queries/user-group-ids-among user-id #{g1 g3} #{})))
      (is (= #{g1 g2} (sso.queries/user-group-ids-among user-id #{g1 g2 g3} #{}))))
    (testing "the exclusion set is applied on top of the candidates"
      (is (= #{g1} (sso.queries/user-group-ids-among user-id #{g1 g2} #{g2}))))
    (testing "an empty candidate set returns no groups without querying an empty IN ()"
      (is (= #{} (sso.queries/user-group-ids-among user-id #{} #{}))))))

(deftest set-params-bind-every-element-test
  (testing "an id set expands to one ? per element; no value reaches the statement text"
    (let [[sql & params] (#'sso.queries/user-group-ids-among-sqlvec
                          {:user-id 1 :group-ids [5 6] :excluded-group-ids [10]})]
      (is (= "SELECT group_id\nFROM permissions_group_membership\nWHERE user_id = ?\n  AND group_id IN (?,?)\n  AND group_id NOT IN (?)" sql))
      (is (= [1 5 6 10] params))))
  (testing "a hostile provider string lands in the params, not the SQL"
    (let [[sql & params] (#'sso.queries/auth-identity-exists-sqlvec
                          {:user-id 1 :provider "x' OR '1'='1"})]
      (is (not (str/includes? sql "OR")))
      (is (= [1 "x' OR '1'='1"] params)))))
