(ns metabase-enterprise.impersonation.models-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
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
