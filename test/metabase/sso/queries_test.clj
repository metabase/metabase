(ns metabase.sso.queries-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.hugsql :as app-db.hugsql]
   [metabase.permissions.core :as perms]
   [metabase.sso.queries :as sso.queries]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
      ;; Regression on two counts. `non-empty-ids` binds 0 for an empty set: a NULL sentinel would
      ;; make `group_id NOT IN (NULL)` evaluate to NULL under SQL three-valued logic, filtering out
      ;; every row. And the HoneySQL this replaced emitted a literal `NOT IN ()` for an empty
      ;; vector, which H2 tolerates but Postgres and MySQL reject as a syntax error -- so this path
      ;; was broken on a real app-db before the port. See `app-db.hugsql/non-empty-ids`.
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
      (is (= (str "SELECT group_id\n"
                  "FROM permissions_group_membership\n"
                  "WHERE user_id = ?\n"
                  "  AND group_id IN (?,?)\n"
                  "  AND group_id NOT IN (?)")
             sql))
      (is (= [1 5 6 10] params))))
  (testing "a hostile provider string lands in the params, not the SQL"
    (let [[sql & params] (#'sso.queries/auth-identity-exists-sqlvec
                          {:user-id 1 :provider "x' OR '1'='1"})]
      (is (not (str/includes? sql "OR")))
      (is (= [1 "x' OR '1'='1"] params)))))

(deftest non-empty-ids-sentinel-test
  (testing "the 0 sentinel is correct under both IN and NOT IN, which is why there is one helper"
    (is (= [0] (app-db.hugsql/non-empty-ids #{})))
    (is (= [0] (app-db.hugsql/non-empty-ids nil)))
    (is (= [7] (app-db.hugsql/non-empty-ids #{7}))))
  (testing "IN (0) matches nothing and NOT IN (0) excludes nothing, on a positive-id column"
    (is (empty? (t2/query ["SELECT 1 AS r WHERE 5 IN (?)" 0])))
    (is (seq (t2/query ["SELECT 1 AS r WHERE 5 NOT IN (?)" 0]))))
  (testing "NULL would be wrong for NOT IN -- the bug this helper's shape prevents"
    (is (empty? (t2/query ["SELECT 1 AS r WHERE 5 NOT IN (?)" nil])))))

(deftest ^:parallel no-empty-in-list-in-emitted-sql-test
  (testing "an empty id collection never emits `IN ()`, which H2 tolerates and Postgres/MySQL reject"
    ;; This is the class of bug `non-empty-ids` exists to close, asserted on the SQL text so it is
    ;; caught on every app-db engine rather than only the one CI happens to run the suite under.
    ;; The HoneySQL this replaced emitted `group_id NOT IN ()` for an empty vector.
    (doseq [[label sqlvec] {"excluding, empty exclusions"
                            (#'sso.queries/user-group-ids-excluding-sqlvec
                             {:user-id 1 :excluded-group-ids (app-db.hugsql/non-empty-ids #{})})
                            "among, empty exclusions"
                            (#'sso.queries/user-group-ids-among-sqlvec
                             {:user-id 1 :group-ids [2]
                              :excluded-group-ids (app-db.hugsql/non-empty-ids #{})})}]
      (testing label
        (let [sql (first sqlvec)]
          (is (not (str/includes? sql "IN ()"))
              (str "emitted an empty IN list: " sql))
          (is (str/includes? sql "IN (?)")
              "the sentinel should bind as a single placeholder"))))))
