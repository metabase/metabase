(ns metabase.permissions-rest.data-permissions.graph.bulk-update-test
  "Unit tests for the pure functions in the bulk permissions graph update implementation."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions-rest.data-permissions.graph :as data-perms.graph]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private tables-by-db-schema
  "A mock table index with two schemas: PUBLIC has tables 1,2 and OTHER has table 3."
  {[1 "PUBLIC"] [{:id 10 :db_id 1 :schema "PUBLIC"}
                 {:id 11 :db_id 1 :schema "PUBLIC"}]
   [1 nil]      [{:id 12 :db_id 1 :schema nil}]})

;;; ================================ resolve-api-value ================================

(deftest resolve-api-value-db-level-test
  (testing "DB-level keyword values"
    (is (= {nil {:perm_value :unrestricted :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :view-data :unrestricted 1 tables-by-db-schema)))
    (is (= {nil {:perm_value :blocked :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :view-data :blocked 1 tables-by-db-schema)))
    (is (= {nil {:perm_value :query-builder-and-native :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :create-queries :query-builder-and-native 1 tables-by-db-schema)))
    (is (= {nil {:perm_value :no :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :create-queries :no 1 tables-by-db-schema)))))

(deftest resolve-api-value-download-wrapper-test
  (testing "Download and data-model unwrap the :schemas key"
    (is (= {nil {:perm_value :one-million-rows :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :download {:schemas :full} 1 tables-by-db-schema)))
    (is (= {nil {:perm_value :no :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :download {:schemas :none} 1 tables-by-db-schema)))
    (is (= {nil {:perm_value :yes :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :data-model {:schemas :all} 1 tables-by-db-schema)))
    (is (= {nil {:perm_value :no :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :data-model {:schemas :none} 1 tables-by-db-schema)))))

(deftest resolve-api-value-schema-level-test
  (testing "Schema-level keyword expands to all tables in that schema"
    (is (= {10 {:perm_value :unrestricted :schema_name "PUBLIC"}
            11 {:perm_value :unrestricted :schema_name "PUBLIC"}}
           (#'data-perms.graph/resolve-api-value :view-data {"PUBLIC" :unrestricted} 1 tables-by-db-schema))))
  (testing "Multiple schemas"
    (is (= {10 {:perm_value :unrestricted :schema_name "PUBLIC"}
            11 {:perm_value :unrestricted :schema_name "PUBLIC"}
            12 {:perm_value :blocked :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :view-data {"PUBLIC" :unrestricted "" :blocked}
                                                 1 tables-by-db-schema)))))

(deftest resolve-api-value-table-level-test
  (testing "Table-level values produce per-table entries"
    (is (= {10 {:perm_value :query-builder :schema_name "PUBLIC"}
            11 {:perm_value :no :schema_name "PUBLIC"}}
           (#'data-perms.graph/resolve-api-value :create-queries {"PUBLIC" {10 :query-builder 11 :no}}
                                                 1 tables-by-db-schema)))))

(deftest resolve-api-value-empty-schema-test
  (testing "Empty string schema maps to nil (null schema in DB)"
    (is (= {12 {:perm_value :unrestricted :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :view-data {"" :unrestricted} 1 tables-by-db-schema)))))

(deftest resolve-api-value-translation-test
  (testing "API values are translated to DB values"
    (is (= {nil {:perm_value :unrestricted :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :view-data :impersonated 1 tables-by-db-schema)))
    (is (= {nil {:perm_value :unrestricted :schema_name nil}}
           (#'data-perms.graph/resolve-api-value :view-data :sandboxed 1 tables-by-db-schema)))
    (is (= {10 {:perm_value :one-million-rows :schema_name "PUBLIC"}
            11 {:perm_value :no :schema_name "PUBLIC"}}
           (#'data-perms.graph/resolve-api-value :download {:schemas {"PUBLIC" {10 :full 11 :none}}}
                                                 1 tables-by-db-schema)))
    (is (= {10 {:perm_value :yes :schema_name "PUBLIC"}
            11 {:perm_value :no :schema_name "PUBLIC"}}
           (#'data-perms.graph/resolve-api-value :data-model {:schemas {"PUBLIC" {10 :all 11 :none}}}
                                                 1 tables-by-db-schema)))))

;;; ================================ add-implications ================================

(deftest add-implications-create-queries-db-level-test
  (testing "create-queries non-:no at db-level implies view-data :unrestricted and transforms :no"
    (let [desired {}
          entries {nil {:perm_value :query-builder :schema_name nil}}
          result  (#'data-perms.graph/add-implications desired 1 1 :perms/create-queries entries)]
      (is (= {nil {:perm_value :unrestricted :schema_name nil}}
             (get result [1 1 :perms/view-data])))
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get result [1 1 :perms/transforms])))))
  (testing "create-queries :query-builder-and-native implies view-data but NOT transforms :no"
    (let [desired {}
          entries {nil {:perm_value :query-builder-and-native :schema_name nil}}
          result  (#'data-perms.graph/add-implications desired 1 1 :perms/create-queries entries)]
      (is (= {nil {:perm_value :unrestricted :schema_name nil}}
             (get result [1 1 :perms/view-data])))
      (is (nil? (get result [1 1 :perms/transforms])))))
  (testing "create-queries :no implies transforms :no but NOT view-data"
    (let [desired {}
          entries {nil {:perm_value :no :schema_name nil}}
          result  (#'data-perms.graph/add-implications desired 1 1 :perms/create-queries entries)]
      (is (nil? (get result [1 1 :perms/view-data])))
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get result [1 1 :perms/transforms]))))))

(deftest add-implications-view-data-db-level-test
  (testing "view-data :blocked implies create-queries :no, download :no, and transforms :no"
    (let [result (#'data-perms.graph/add-implications {} 1 1 :perms/view-data
                                                      {nil {:perm_value :blocked :schema_name nil}})]
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get result [1 1 :perms/create-queries])))
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get result [1 1 :perms/download-results])))
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get result [1 1 :perms/transforms])))))
  (testing "view-data :unrestricted has no implications"
    (let [result (#'data-perms.graph/add-implications {} 1 1 :perms/view-data
                                                      {nil {:perm_value :unrestricted :schema_name nil}})]
      (is (empty? result)))))

(deftest add-implications-table-level-test
  (testing "Table-level create-queries non-:no implies view-data for those tables only"
    (let [entries {10 {:perm_value :query-builder :schema_name "PUBLIC"}
                   11 {:perm_value :no :schema_name "PUBLIC"}}
          result  (#'data-perms.graph/add-implications {} 1 1 :perms/create-queries entries)]
      (is (= {10 {:perm_value :unrestricted :schema_name "PUBLIC"}}
             (get result [1 1 :perms/view-data])))
      (is (nil? (get result [1 1 :perms/transforms]))
          "No transforms implication at table level")))
  (testing "Table-level view-data :blocked implies create-queries :no and download :no for those tables"
    (let [entries {10 {:perm_value :blocked :schema_name "PUBLIC"}
                   11 {:perm_value :unrestricted :schema_name "PUBLIC"}}
          result  (#'data-perms.graph/add-implications {} 1 1 :perms/view-data entries)]
      (is (= {10 {:perm_value :no :schema_name "PUBLIC"}}
             (get result [1 1 :perms/create-queries])))
      (is (= {10 {:perm_value :no :schema_name "PUBLIC"}}
             (get result [1 1 :perms/download-results]))))))

(deftest add-implications-override-behavior-test
  (testing "Implications override existing entries (later perm-type side effects take precedence)"
    (let [desired {[1 1 :perms/transforms] {nil {:perm_value :yes :schema_name nil}}}
          entries {nil {:perm_value :query-builder :schema_name nil}}
          result  (#'data-perms.graph/add-implications desired 1 1 :perms/create-queries entries)]
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get result [1 1 :perms/transforms]))
          "create-queries :query-builder implies transforms :no, overriding earlier :yes")))
  (testing "Protection from overriding explicit API values comes from processing order, not add-implications"
    (let [graph   {1 {1 {:create-queries :query-builder :view-data :blocked}}}
          desired (#'data-perms.graph/compute-desired-state graph tables-by-db-schema)]
      (is (= {nil {:perm_value :blocked :schema_name nil}}
             (get desired [1 1 :perms/view-data]))
          "Explicit view-data :blocked overrides create-queries's implication because view-data is processed last"))))

;;; ================================ compute-desired-state ================================

(deftest compute-desired-state-ordering-test
  (testing "Transforms :yes is overridden by create-queries implication of transforms :no"
    (let [graph   {1 {1 {:transforms :yes :create-queries :query-builder}}}
          desired (#'data-perms.graph/compute-desired-state graph tables-by-db-schema)]
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get desired [1 1 :perms/transforms])))))
  (testing "Explicit view-data overrides create-queries implication"
    (let [graph   {1 {1 {:create-queries :query-builder :view-data :blocked}}}
          desired (#'data-perms.graph/compute-desired-state graph tables-by-db-schema)]
      (is (= {nil {:perm_value :blocked :schema_name nil}}
             (get desired [1 1 :perms/view-data]))))))

(deftest compute-desired-state-details-test
  (testing "Details and transforms produce db-level entries"
    (let [desired (#'data-perms.graph/compute-desired-state {1 {1 {:details :yes :transforms :no}}} tables-by-db-schema)]
      (is (= {nil {:perm_value :yes :schema_name nil}}
             (get desired [1 1 :perms/manage-database])))
      (is (= {nil {:perm_value :no :schema_name nil}}
             (get desired [1 1 :perms/transforms]))))))

;;; ================================ finalize-tuple ================================

(def ^:private all-tables-db1
  [{:id 10 :db_id 1 :schema "PUBLIC"}
   {:id 11 :db_id 1 :schema "PUBLIC"}
   {:id 12 :db_id 1 :schema nil}])

(deftest finalize-tuple-pure-db-level-test
  (testing "Pure db-level entry produces one db-level row"
    (let [result (#'data-perms.graph/finalize-tuple 1 1 :perms/view-data
                                                    {nil {:perm_value :unrestricted :schema_name nil}}
                                                    [] all-tables-db1)]
      (is (= [{:perm_type :perms/view-data :group_id 1 :perm_value :unrestricted :db_id 1}]
             result)))))

(deftest finalize-tuple-table-level-empty-current-test
  (testing "Table-level entries with no current state produce table-level rows"
    (let [result (#'data-perms.graph/finalize-tuple 1 1 :perms/create-queries
                                                    {10 {:perm_value :query-builder :schema_name "PUBLIC"}}
                                                    [] all-tables-db1)]
      (is (= [{:perm_type :perms/create-queries :group_id 1 :perm_value :query-builder
               :db_id 1 :table_id 10 :schema_name "PUBLIC"}]
             result)))))

(deftest finalize-tuple-noop-when-current-db-level-matches-test
  (testing "Table-level entries that all match current db-level value coalesce (no-op)"
    (let [current [{:id 99 :perm_type :perms/view-data :group_id 1 :perm_value :unrestricted
                    :db_id 1 :table_id nil :schema_name nil}]
          result  (#'data-perms.graph/finalize-tuple 1 1 :perms/view-data
                                                     {10 {:perm_value :unrestricted :schema_name "PUBLIC"}}
                                                     current all-tables-db1)]
      (is (= [{:perm_type :perms/view-data :group_id 1 :perm_value :unrestricted :db_id 1}]
             result)))))

(deftest finalize-tuple-expand-db-level-on-change-test
  (testing "When current is db-level and change differs, expands to table-level"
    (let [current [{:id 99 :perm_type :perms/view-data :group_id 1 :perm_value :unrestricted
                    :db_id 1 :table_id nil :schema_name nil}]
          result  (#'data-perms.graph/finalize-tuple 1 1 :perms/view-data
                                                     {10 {:perm_value :blocked :schema_name "PUBLIC"}}
                                                     current all-tables-db1)]
      (is (= 3 (count result)))
      (is (every? :table_id result))
      (is (= :blocked (:perm_value (first (filter #(= 10 (:table_id %)) result)))))
      (is (= :unrestricted (:perm_value (first (filter #(= 11 (:table_id %)) result)))))
      (is (= :unrestricted (:perm_value (first (filter #(= 12 (:table_id %)) result))))))))

(deftest finalize-tuple-mixed-level-coalesces-test
  (testing "Mixed db-level + table overrides coalesces when all values same"
    (let [result (#'data-perms.graph/finalize-tuple 1 1 :perms/view-data
                                                    {nil {:perm_value :unrestricted :schema_name nil}
                                                     10  {:perm_value :unrestricted :schema_name "PUBLIC"}}
                                                    [] all-tables-db1)]
      (is (= [{:perm_type :perms/view-data :group_id 1 :perm_value :unrestricted :db_id 1}]
             result))))
  (testing "Mixed db-level + table overrides stays table-level when values differ"
    (let [result (#'data-perms.graph/finalize-tuple 1 1 :perms/view-data
                                                    {nil {:perm_value :unrestricted :schema_name nil}
                                                     10  {:perm_value :blocked :schema_name "PUBLIC"}}
                                                    [] all-tables-db1)]
      (is (= 3 (count result)))
      (is (every? :table_id result)))))

(deftest finalize-tuple-query-builder-and-native-expansion-test
  (testing ":query-builder-and-native becomes :query-builder when expanding to table-level"
    (let [current [{:id 99 :perm_type :perms/create-queries :group_id 1
                    :perm_value :query-builder-and-native :db_id 1 :table_id nil :schema_name nil}]
          result  (#'data-perms.graph/finalize-tuple 1 1 :perms/create-queries
                                                     {10 {:perm_value :no :schema_name "PUBLIC"}}
                                                     current all-tables-db1)]
      (is (= :no (:perm_value (first (filter #(= 10 (:table_id %)) result)))))
      (is (= :query-builder (:perm_value (first (filter #(= 11 (:table_id %)) result)))))
      (is (= :query-builder (:perm_value (first (filter #(= 12 (:table_id %)) result))))))))

;;; ================================ rows-match? ================================

(deftest rows-match?-test
  (testing "Matching rows"
    (is (#'data-perms.graph/rows-match?
         [{:perm_type :perms/view-data :perm_value :unrestricted :table_id nil :schema_name nil}]
         [{:perm_type :perms/view-data :perm_value :unrestricted :table_id nil :schema_name nil}])))
  (testing "Different values don't match"
    (is (not (#'data-perms.graph/rows-match?
              [{:perm_type :perms/view-data :perm_value :unrestricted :table_id nil :schema_name nil}]
              [{:perm_type :perms/view-data :perm_value :blocked :table_id nil :schema_name nil}]))))
  (testing "Different formats (db-level vs table-level) don't match"
    (is (not (#'data-perms.graph/rows-match?
              [{:perm_type :perms/view-data :perm_value :unrestricted :table_id nil :schema_name nil}]
              [{:perm_type :perms/view-data :perm_value :unrestricted :table_id 10 :schema_name "PUBLIC"}])))))

;;; ================================ compute-diff ================================

(deftest compute-diff-noop-test
  (testing "No-op when desired matches current"
    (let [desired-state {[1 1 :perms/view-data] {nil {:perm_value :unrestricted :schema_name nil}}}
          current-index {[1 1 :perms/view-data] [{:id 99 :perm_type :perms/view-data :group_id 1
                                                  :perm_value :unrestricted :db_id 1
                                                  :table_id nil :schema_name nil}]}
          tables-by-db  {1 all-tables-db1}
          result        (#'data-perms.graph/compute-diff desired-state current-index tables-by-db)]
      (is (empty? (:to-delete result)))
      (is (empty? (:to-insert result))))))

(deftest compute-diff-change-test
  (testing "Produces deletes and inserts when state changes"
    (let [desired-state {[1 1 :perms/view-data] {nil {:perm_value :blocked :schema_name nil}}}
          current-index {[1 1 :perms/view-data] [{:id 99 :perm_type :perms/view-data :group_id 1
                                                  :perm_value :unrestricted :db_id 1
                                                  :table_id nil :schema_name nil}]}
          tables-by-db  {1 all-tables-db1}
          result        (#'data-perms.graph/compute-diff desired-state current-index tables-by-db)]
      (is (= [99] (:to-delete result)))
      (is (= [{:perm_type :perms/view-data :group_id 1 :perm_value :blocked :db_id 1}]
             (:to-insert result))))))

(deftest compute-diff-new-perms-test
  (testing "Inserts without deletes when no current state exists"
    (let [desired-state {[1 1 :perms/view-data] {nil {:perm_value :unrestricted :schema_name nil}}}
          result        (#'data-perms.graph/compute-diff desired-state {} {1 all-tables-db1})]
      (is (empty? (:to-delete result)))
      (is (= [{:perm_type :perms/view-data :group_id 1 :perm_value :unrestricted :db_id 1}]
             (:to-insert result))))))

;;; ================================ N+1 regression ================================

(deftest ^:synchronized update-data-perms-graph-query-count-regression-test
  (testing "update-data-perms-graph!* uses a constant number of queries regardless of input size"
    ;; 3 groups × 3 databases × 2 schemas each × 3 tables per schema = 18 tables per db
    ;; Permissions set across multiple perm types at mixed granularity.
    ;; An N+1 in any dimension (groups, dbs, schemas, perm types, tables) would push
    ;; the query count well above the threshold.
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/PermissionsGroup {g1  :id} {}
                     :model/PermissionsGroup {g2  :id} {}
                     :model/PermissionsGroup {g3  :id} {}
                     :model/Database         {db1 :id} {}
                     :model/Database         {db2 :id} {}
                     :model/Database         {db3 :id} {}
                     :model/Table {t1a :id}  {:db_id db1 :schema "s1"}
                     :model/Table {t1b :id}  {:db_id db1 :schema "s1"}
                     :model/Table {t1c :id}  {:db_id db1 :schema "s1"}
                     :model/Table {t1d :id}  {:db_id db1 :schema "s2"}
                     :model/Table {t1e :id}  {:db_id db1 :schema "s2"}
                     :model/Table {t1f :id}  {:db_id db1 :schema "s2"}
                     :model/Table {t2a :id}  {:db_id db2 :schema "s1"}
                     :model/Table {t2b :id}  {:db_id db2 :schema "s1"}
                     :model/Table {t2c :id}  {:db_id db2 :schema "s1"}
                     :model/Table {_t2d :id} {:db_id db2 :schema "s2"}
                     :model/Table {_t2e :id} {:db_id db2 :schema "s2"}
                     :model/Table {_t2f :id} {:db_id db2 :schema "s2"}
                     :model/Table {t3a :id}  {:db_id db3 :schema "s1"}
                     :model/Table {t3b :id}  {:db_id db3 :schema "s1"}
                     :model/Table {_t3c :id} {:db_id db3 :schema "s1"}
                     :model/Table {t3d :id}  {:db_id db3 :schema "s2"}
                     :model/Table {t3e :id}  {:db_id db3 :schema "s2"}
                     :model/Table {_t3f :id} {:db_id db3 :schema "s2"}]
        ;; Clear default perms so we start clean
        (t2/delete! :model/DataPermissions :group_id [:in [g1 g2 g3]])
        (let [graph {g1 {db1 {:view-data      :unrestricted
                              :create-queries :query-builder-and-native
                              :download       {:schemas :full}
                              :data-model     {:schemas :all}
                              :details        :yes
                              :transforms     :yes}
                         db2 {:view-data      :blocked}
                         db3 {:view-data      {"s1" :unrestricted
                                               "s2" {t3d :blocked}}
                              :create-queries {"s1" :query-builder
                                               "s2" :no}}}
                     g2 {db1 {:view-data      {"s1" {t1a :unrestricted
                                                     t1b :blocked
                                                     t1c :unrestricted}
                                               "s2" :unrestricted}
                              :download       {:schemas {"s1" :full
                                                         "s2" {t1d :full t1e :none t1f :limited}}}}
                         db2 {:view-data      :unrestricted
                              :create-queries :query-builder
                              :download       {:schemas {"s1" {t2a :full t2b :none t2c :limited}
                                                         "s2" :full}}
                              :data-model     {:schemas {"s1" {t2a :all t2b :none t2c :all}
                                                         "s2" :none}}}
                         db3 {:view-data      :unrestricted
                              :create-queries :query-builder-and-native
                              :details        :no
                              :transforms     :yes}}
                     g3 {db1 {:view-data      :blocked}
                         db2 {:view-data      :legacy-no-self-service
                              :create-queries :no}
                         db3 {:view-data      :unrestricted
                              :download       {:schemas :full}
                              :data-model     {:schemas {"s1" {t3a :all t3b :none}
                                                         "s2" {t3d :all t3e :none}}}}}}
              ;; Run the update and count queries.
              ;; Expected: 1 select tables + 1 select current perms + 1 bulk delete + 1 bulk insert = 4
              ;; If this grows to 5 or 6, that's okay, but more should be very suspicious - it's very likely an N+1
              ;; query in one of these dimensions!
              query-count (t2/with-call-count [call-count]
                            (data-perms.graph/update-data-perms-graph!* graph)
                            (call-count))]
          (is (<= query-count 4)
              (format "Expected constant query count but got %d — possible N+1 regression" query-count)))

        ;; Verify the permissions actually took effect by spot-checking a few values
        (let [result (data-perms.graph/data-permissions-graph :group-ids [g1 g2 g3])]
          (testing "g1/db1 db-level perms applied"
            (is (= :unrestricted             (get-in result [g1 db1 :perms/view-data])))
            (is (= :query-builder-and-native (get-in result [g1 db1 :perms/create-queries]))))
          (testing "g1/db2 blocked cascades"
            (is (= :blocked (get-in result [g1 db2 :perms/view-data])))
            (is (= :no      (get-in result [g1 db2 :perms/create-queries]))))
          (testing "g2/db1 table-level view-data and download"
            (is (= :blocked           (get-in result [g2 db1 :perms/view-data "s1" t1b])))
            (is (= :no                (get-in result [g2 db1 :perms/download-results "s2" t1e])))
            (is (= :ten-thousand-rows (get-in result [g2 db1 :perms/download-results "s2" t1f]))))
          (testing "g2/db2 table-level download and data-model"
            (is (= :no (get-in result [g2 db2 :perms/download-results "s1" t2b])))
            (is (= :no (get-in result [g2 db2 :perms/manage-table-metadata "s1" t2b]))))
          (testing "g3/db3 table-level data-model"
            (is (= :yes (get-in result [g3 db3 :perms/manage-table-metadata "s1" t3a])))
            (is (= :no  (get-in result [g3 db3 :perms/manage-table-metadata "s1" t3b])))
            (is (= :yes (get-in result [g3 db3 :perms/manage-table-metadata "s2" t3d])))
            (is (= :no  (get-in result [g3 db3 :perms/manage-table-metadata "s2" t3e])))))))))
