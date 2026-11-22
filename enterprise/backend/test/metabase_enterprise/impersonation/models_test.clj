(ns metabase-enterprise.impersonation.models-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.models :as impersonation.models]
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(deftest attribute-is-non-blank-test
  (doseq [attribute [nil "" "  "]]
    (testing (pr-str attribute)
      (is (not (mr/validate ::impersonation.schema/connection-impersonation.update {:attribute attribute})))))
  (is (mr/validate ::impersonation.schema/connection-impersonation.update {:attribute "role"})))

(deftest group-and-database-are-frozen-test
  (mt/with-temp [:model/PermissionsGroup         {group-id :id}         {}
                 :model/PermissionsGroup         {other-group-id :id}   {}
                 :model/Database                 {other-db-id :id}      {}
                 :model/ConnectionImpersonation  {impersonation-id :id} {:group_id  group-id
                                                                         :db_id     (mt/id)
                                                                         :attribute "role"}]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"You cannot change the group of a connection impersonation"
         (t2/update! :model/ConnectionImpersonation :id impersonation-id {:group_id other-group-id})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"You cannot change the database of a connection impersonation"
         (t2/update! :model/ConnectionImpersonation :id impersonation-id {:db_id other-db-id})))
    (is (=? {:group_id group-id :db_id (mt/id)}
            (t2/select-one :model/ConnectionImpersonation :id impersonation-id)))))

(deftest insert-impersonations-statement-count-does-not-grow-with-rows-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                   :model/Database {db-1 :id} {}
                   :model/Database {db-2 :id} {}
                   :model/Database {db-3 :id} {}
                   :model/Database {db-4 :id} {}
                   :model/Database {db-5 :id} {}
                   :model/Database {db-6 :id} {}]
      (mt/with-model-cleanup [:model/ConnectionImpersonation]
        (let [rows    (fn [db-ids attribute] (mapv #(hash-map :group_id group-id :db_id % :attribute attribute) db-ids))
              counted (fn [n]
                        (let [db-ids (take n [db-1 db-2 db-3 db-4 db-5 db-6])]
                          (impersonation.models/upsert-connection-impersonations-for-graph! (rows (take-nth 2 db-ids) "old_role"))
                          (events.tu/statement-count! #(impersonation.models/upsert-connection-impersonations-for-graph! (rows db-ids "new_role")))))]
          (testing "replacing the impersonations of half of the Databases and adding the others"
            (counted 1)
            (is (= (counted 2) (counted 6)))))))))

(deftest insert-impersonations-keeps-the-last-row-of-each-group-and-database-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup        {group-id :id} {}
                   :model/Database                {db-id :id}    {}
                   :model/Database                {other-id :id} {}
                   :model/ConnectionImpersonation _              {:group_id group-id :db_id db-id :attribute "stored_role"}]
      (let [inserted (impersonation.models/upsert-connection-impersonations-for-graph!
                      [{:group_id group-id :db_id db-id :attribute "first_role"}
                       {:group_id group-id :db_id other-id :attribute "other_role"}
                       {:group_id group-id :db_id db-id :attribute "last_role"}])]
        (is (= ["first_role" "other_role" "last_role"] (map :attribute inserted)))
        (is (= {db-id ["last_role"] other-id ["other_role"]}
               (update-vals (group-by :db_id (t2/select :model/ConnectionImpersonation :group_id group-id))
                            #(mapv :attribute %))))))))
