(ns metabase-enterprise.impersonation.models-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest attribute-is-non-blank-test
  (mt/with-temp [:model/PermissionsGroup {group-id :id} {}]
    (testing "insert"
      (doseq [attribute [nil "" "  "]]
        (testing (pr-str attribute)
          (is (=? {:status-code 400}
                  (try (t2/insert! :model/ConnectionImpersonation {:group_id group-id :db_id (mt/id) :attribute attribute})
                       (catch clojure.lang.ExceptionInfo e (ex-data e)))))))
      (is (not (t2/exists? :model/ConnectionImpersonation :group_id group-id))))
    (testing "update"
      (mt/with-temp [:model/ConnectionImpersonation {impersonation-id :id} {:group_id  group-id
                                                                            :db_id     (mt/id)
                                                                            :attribute "role"}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"non-blank user attribute name"
             (t2/update! :model/ConnectionImpersonation :id impersonation-id {:attribute ""})))
        (is (= 1 (t2/update! :model/ConnectionImpersonation :id impersonation-id {:attribute "other_role"})))
        (is (= "other_role" (t2/select-one-fn :attribute :model/ConnectionImpersonation :id impersonation-id)))))))

(deftest group-and-database-are-frozen-test
  (mt/with-temp [:model/PermissionsGroup         {group-id :id}         {}
                 :model/PermissionsGroup         {other-group-id :id}   {}
                 :model/Database                 {other-db-id :id}      {}
                 :model/ConnectionImpersonation  {impersonation-id :id} {:group_id  group-id
                                                                         :db_id     (mt/id)
                                                                         :attribute "role"}]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"You cannot change the group ID of a connection impersonation"
         (t2/update! :model/ConnectionImpersonation :id impersonation-id {:group_id other-group-id})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"You cannot change the database ID of a connection impersonation"
         (t2/update! :model/ConnectionImpersonation :id impersonation-id {:db_id other-db-id})))
    (is (=? {:group_id group-id :db_id (mt/id)}
            (t2/select-one :model/ConnectionImpersonation :id impersonation-id)))))
