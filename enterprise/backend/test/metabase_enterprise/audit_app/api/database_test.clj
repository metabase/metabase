(ns metabase-enterprise.audit-app.api.database-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.audit-test :as audit-test]
   [metabase.audit-app.core :as audit]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :plugins))

(deftest audit-db-unmodifiable-test
  (mt/with-premium-features #{:audit-app}
    (audit-test/with-audit-db-restoration!
      (testing "Neither admin nor regular users can modify the audit database"
        (doseq [[verb path] [[:post "persist/database/%d/unpersist"]
                             [:put "database/%d"]
                             [:get "database/%d/syncable_schemas"]
                             [:delete "database/%d"]]
                user [:crowberto :lucky]]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request user verb 403 (format path audit/audit-db-id)))))))))

(deftest audit-db-excluded-from-database-list-test
  (mt/with-premium-features #{:audit-app}
    (audit-test/with-audit-db-restoration!
      (testing "GET /api/database excludes the audit DB by default"
        (is (not (contains? (set (map :id (:data (mt/user-http-request :crowberto :get 200 "database"))))
                            audit/audit-db-id))))
      (testing "GET /api/database?include_analytics=true includes the audit DB"
        (is (contains? (set (map :id (:data (mt/user-http-request :crowberto :get 200 "database" :include_analytics true))))
                       audit/audit-db-id))))))
