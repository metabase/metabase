(ns metabase.permissions.row-restriction-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-access-token :as data-access-token]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

(defn- row-restricted-table-ids
  "[[perms/row-restricted-table-ids]] of `tables`."
  [& tables]
  (perms/row-restricted-table-ids (map #(select-keys % [:id :db_id]) tables)))

(deftest row-restricted-table-ids-fails-closed-on-error-test
  (testing "a table whose data-access-token can't be computed is treated as row-restricted"
    (mt/with-temp [:model/Database db {}
                   :model/Table    table {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [data-access-token/data-access-token (fn [_] (throw (ex-info "boom" {})))]
          (is (= #{(:id table)} (row-restricted-table-ids table))))))))

(deftest row-restricted-table-ids-logs-restriction-probe-failure-test
  (testing "a data-access-token failure is logged at debug level instead of failing silently"
    (mt/with-temp [:model/Database db {}
                   :model/Table    table {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [data-access-token/data-access-token (fn [_] (throw (ex-info "boom" {})))]
          (log.capture/with-log-messages-for-level [logs [metabase.permissions.row-restriction :debug]]
            (row-restricted-table-ids table)
            (is (some #(re-find #"Restriction probe failed" (:message %)) (logs)))))))))

(deftest row-restricted-table-ids-batches-per-database-test
  (testing "impersonation/routing dimensions (database-wide) restrict every table in that database"
    (mt/with-temp [:model/Database db {}
                   :model/Table    t1 {:db_id (:id db)}
                   :model/Table    t2 {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [data-access-token/data-access-token (fn [_] {:impersonation {(:id db) "digest"}})]
          (is (= #{(:id t1) (:id t2)} (row-restricted-table-ids t1 t2)))))))
  (testing "sandbox restriction (per-table) only restricts the sandboxed table, not its siblings"
    (mt/with-temp [:model/Database db {}
                   :model/Table    sandboxed {:db_id (:id db)}
                   :model/Table    open      {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [data-access-token/data-access-token
                                    (fn [{:keys [table-ids]}]
                                      {:sandbox (into {}
                                                      (map (fn [id] [id "digest"]))
                                                      (filter #{(:id sandboxed)} table-ids))})]
          (is (= #{(:id sandboxed)}
                 (row-restricted-table-ids sandboxed open))))))))

(deftest row-restricted-table-ids-narrows-fail-closed-to-offending-table-test
  (testing "when the batched call throws, only the table whose own token still can't be computed is
            restricted -- an unrelated sibling in the same database is not swept in"
    (mt/with-temp [:model/Database db {}
                   :model/Table    broken {:db_id (:id db)}
                   :model/Table    open   {:db_id (:id db)}]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [data-access-token/data-access-token
                                    (fn [{:keys [table-ids]}]
                                      (if (contains? table-ids (:id broken))
                                        (throw (ex-info "boom" {}))
                                        {}))]
          (is (= #{(:id broken)}
                 (row-restricted-table-ids broken open))))))))

(deftest remove-row-restricted-fingerprints-test
  (mt/with-temp [:model/Database db         {}
                 :model/Table    restricted {:db_id (:id db)}
                 :model/Table    open       {:db_id (:id db)}]
    (let [fp     {:global {:distinct-count 8}}
          field  (fn [table id & {:as more}]
                   (merge {:id id :table_id (:id table) :fingerprint fp} more))
          fields [(field restricted 1 :target (field open 2) :name_field (field restricted 3))
                  (field open 4 :target (field restricted 5)
                         :dimensions [{:human_readable_field (field restricted 6)}])]]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [data-access-token/data-access-token
                                    (fn [{:keys [table-ids]}]
                                      {:sandbox (into {} (map (fn [id] [id "digest"])) (filter #{(:id restricted)} table-ids))})]
          (testing "only the Fields of a row-restricted table lose their fingerprint, nested ones included"
            (is (= [(-> (first fields)
                        (dissoc :fingerprint)
                        (update :name_field dissoc :fingerprint))
                    (-> (second fields)
                        (update :target dissoc :fingerprint)
                        (update-in [:dimensions 0 :human_readable_field] dissoc :fingerprint))]
                   (perms/remove-row-restricted-fingerprints fields)))))
        (testing "the databases of the tables the caller holds are not looked up again"
          (mt/with-dynamic-fn-redefs [data-access-token/data-access-token (constantly {})]
            (is (= 0 (t2/with-call-count [call-count]
                       (perms/remove-row-restricted-fingerprints fields {(:id restricted) (:id db), (:id open) (:id db)})
                       (call-count))))))
        (testing "nothing is removed when no table is restricted"
          (mt/with-dynamic-fn-redefs [data-access-token/data-access-token (constantly {})]
            (is (= fields (perms/remove-row-restricted-fingerprints fields)))))
        (testing "fails closed"
          (mt/with-dynamic-fn-redefs [data-access-token/data-access-token (fn [_] (throw (ex-info "boom" {})))]
            (is (= [] (into [] (comp (filter map?) (keep :fingerprint))
                            (tree-seq coll? seq (perms/remove-row-restricted-fingerprints fields)))))))))))

(deftest remove-row-restricted-card-fingerprints-test
  (mt/with-temp [:model/Database restricted {}
                 :model/Database open       {}]
    (let [card         (fn [db] {:database_id     (:id db)
                                 :result_metadata [{:name "X" :fingerprint {:global {:distinct-count 8}}}]})
          fingerprints (fn [cards] (map #(map :fingerprint (:result_metadata %)) cards))]
      (mt/with-test-user :rasta
        (mt/with-dynamic-fn-redefs [data-access-token/data-access-token
                                    (fn [{:keys [database-id]}]
                                      (if (= database-id (:id restricted)) {:impersonation {database-id "digest"}} {}))]
          (testing "a Card whose row restriction can't be told is judged by its database"
            (is (= [[nil] [{:global {:distinct-count 8}}]]
                   (fingerprints (perms/remove-row-restricted-card-fingerprints-by-database [(card restricted) (card open)])))))
          (testing "a Card with no database counts as restricted"
            (is (= [[nil]]
                   (fingerprints (perms/remove-row-restricted-card-fingerprints-by-database [(dissoc (card open) :database_id)])))))
          (testing "a text dashcard's nil Card passes through"
            (is (= [nil [nil]]
                   (let [[text card'] (perms/remove-row-restricted-card-fingerprints-by-database [nil (card restricted)])]
                     [text (map :fingerprint (:result_metadata card'))]))))
          (is (= [] (perms/remove-row-restricted-card-fingerprints-by-database nil))))))))
