(ns metabase.metabot.metadata-perms-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]))

(deftest row-restricted-table-ids-fails-closed-on-error-test
  (testing "a table whose data-access-token can't be computed is treated as row-restricted"
    (mt/with-temp [:model/Database db {}
                   :model/Table    table {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/data-access-token (fn [_] (throw (ex-info "boom" {})))]
          (is (= #{(:id table)} (metabot.perms/row-restricted-table-ids #{(:id table)}))))))))

(deftest row-restricted-table-ids-logs-restriction-probe-failure-test
  (testing "a data-access-token failure is logged at debug level instead of failing silently"
    (mt/with-temp [:model/Database db {}
                   :model/Table    table {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/data-access-token (fn [_] (throw (ex-info "boom" {})))]
          (log.capture/with-log-messages-for-level [logs [metabase.metabot.metadata-perms :debug]]
            (metabot.perms/row-restricted-table-ids #{(:id table)})
            (is (some #(re-find #"Restriction probe failed" (:message %)) (logs)))))))))

(deftest row-restricted-table-ids-fails-closed-on-unresolvable-table-test
  (testing "a table ID that can't be resolved to a Table row is treated as row-restricted"
    (mt/with-test-user :rasta
      (is (= #{Integer/MAX_VALUE} (metabot.perms/row-restricted-table-ids #{Integer/MAX_VALUE}))))))

(deftest row-restricted-table-ids-batches-per-database-test
  (testing "impersonation/routing dimensions (database-wide) restrict every table in that database"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db)}
                   :model/Table    t2 {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/data-access-token (fn [_] {:impersonation {(:id db) "digest"}})]
          (is (= #{(:id t1) (:id t2)} (metabot.perms/row-restricted-table-ids #{(:id t1) (:id t2)})))))))
  (testing "sandbox restriction (per-table) only restricts the sandboxed table, not its siblings"
    (mt/with-temp [:model/Database db {}
                   :model/Table    sandboxed {:db_id (:id db)}
                   :model/Table    open      {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/data-access-token
                                    (fn [{:keys [table-ids]}]
                                      {:sandbox (into {}
                                                      (map (fn [id] [id "digest"]))
                                                      (filter #{(:id sandboxed)} table-ids))})]
          (is (= #{(:id sandboxed)}
                 (metabot.perms/row-restricted-table-ids #{(:id sandboxed) (:id open)}))))))))

(deftest row-restricted-table-ids-narrows-fail-closed-to-offending-table-test
  (testing "when the batched call throws, only the table whose own token still can't be computed is
            restricted -- an unrelated sibling in the same database is not swept in"
    (mt/with-temp [:model/Database db {}
                   :model/Table    broken {:db_id (:id db)}
                   :model/Table    open   {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [perms/data-access-token
                                    (fn [{:keys [table-ids]}]
                                      (if (contains? table-ids (:id broken))
                                        (throw (ex-info "boom" {}))
                                        {}))]
          (is (= #{(:id broken)}
                 (metabot.perms/row-restricted-table-ids #{(:id broken) (:id open)}))))))))
