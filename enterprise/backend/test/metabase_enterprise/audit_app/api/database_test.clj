(ns metabase-enterprise.audit-app.api.database-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-db-test :as audit-db-test]
   [metabase.models.permissions :as perms]
   [metabase.test :as mt]))

(deftest audit-db-unmodifiable-test
  (mt/with-premium-features #{:audit-app}
    (audit-db-test/with-audit-db-restoration
      (testing "Neither admin nor regular users can modify the audit database"
        (doseq [[verb path] [[:post "database/%d/unpersist"]
                             [:put "database/%d"]
                             [:get "database/%d/syncable_schemas"]
                             [:delete "database/%d"]]
                user [:crowberto :lucky]]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user verb 403 (format path perms/audit-db-id)))))))))
