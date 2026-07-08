(ns ^:mb/driver-tests metabase-enterprise.transforms.merge-test
  "Tests for the key-based `merge` incremental transform target strategy (upsert/restate)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; An append-only status log: `order_id` repeats across rows, `change_seq` is the checkpoint column.
(mt/defdataset merge-test
  "A tiny event-log dataset for testing the merge strategy. `order_id` is the merge key and repeats
   across rows; `change_seq` is the incremental checkpoint column."
  [["order_status"
    [{:field-name "order_id" :base-type :type/Integer}
     {:field-name "status" :base-type :type/Text}
     {:field-name "change_seq" :base-type :type/Integer}]
    [[1 "created" 1]
     [2 "created" 2]
     [3 "created" 3]]]])

;; Two key columns (order_id, region) for testing a composite merge key.
(mt/defdataset merge-composite-test
  "An event log keyed on (order_id, region), for testing a two-column merge key."
  [["order_region_status"
    [{:field-name "order_id" :base-type :type/Integer}
     {:field-name "region" :base-type :type/Text}
     {:field-name "status" :base-type :type/Text}
     {:field-name "change_seq" :base-type :type/Integer}]
    [[1 "us" "created" 1]
     [1 "eu" "created" 2]
     [2 "us" "created" 3]]]])

(defn- test-drivers []
  (mt/normal-drivers-with-feature :transforms/table))

(defn- target-table-gen [prefix]
  {:type     :table
   :name     prefix
   :schema   (t2/select-one-fn :schema :model/Table (mt/id :order_status))
   :database (mt/id)})

(defn- merge-source-query []
  {:database (mt/id)
   :type     :native
   :native   {:query         (format "SELECT %s, %s FROM {{order_status}} AS %s"
                                     (sql.u/quote-name driver/*driver* :field "order_id")
                                     (sql.u/quote-name driver/*driver* :field "status")
                                     (sql.u/quote-name driver/*driver* :field "order_status"))
              :template-tags {"order_status" {:id           "order_status"
                                              :name         "order_status"
                                              :display-name "Order Status"
                                              :type         "table"
                                              :table-id     (mt/id :order_status)
                                              :required     true}}}})

(defn- merge-transform-payload [target-table & {:keys [validate?] :or {validate? true}}]
  (let [seq-field-id (t2/select-one-pk :model/Field :name "change_seq" :table_id (mt/id :order_status))]
    {:name               "Merge Transform"
     :source_database_id (mt/id)
     :source             {:type                         "query"
                          :query                        (merge-source-query)
                          :source-incremental-strategy  {:type "checkpoint"
                                                         :checkpoint-filter-field-id seq-field-id}}
     :target             (merge target-table
                                {:type                         "table-incremental"
                                 :target-incremental-strategy  (cond-> {:type "merge"
                                                                        :unique-key [{:name "order_id"}]}
                                                                 (not validate?)
                                                                 (assoc :validate-unique-key? false))})}))

(defn- insert-order-status!
  "Append `rows` (vectors of `[order-id status change-seq]`) to the source table."
  [rows]
  (let [[schema table-name] (t2/select-one-fn (juxt :schema :name) :model/Table (mt/id :order_status))
        spec   (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
        values (str/join ", " (map (fn [[oid st sq]] (format "(%d, '%s', %d)" oid st sq)) rows))
        sql    (format "INSERT INTO %s (%s) VALUES %s"
                       (sql.u/quote-name driver/*driver* :table schema table-name)
                       (str/join "," (map #(sql.u/quote-name driver/*driver* :field %)
                                          ["order_id" "status" "change_seq"]))
                       values)]
    (driver/execute-raw-queries! driver/*driver* spec [[sql]])))

(defn- target-status-by-order
  "Return the target table contents as a map of `order_id` -> `status`."
  [{:keys [schema name]}]
  (let [sql  (format "SELECT %s, %s FROM %s"
                     (sql.u/quote-name driver/*driver* :field "order_id")
                     (sql.u/quote-name driver/*driver* :field "status")
                     (sql.u/quote-name driver/*driver* :table schema name))
        rows (-> (qp/process-query {:database (mt/id) :type :native :native {:query sql}})
                 :data :rows)]
    (into {} (map (fn [[oid st]] [(long oid) st])) rows)))

(deftest merge-builds-then-upserts-test
  (testing "a merge transform builds the full target, then upserts by key on subsequent runs"
    (mt/test-drivers (test-drivers)
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset merge-test
          (with-transform-cleanup! [target-table (target-table-gen "merge_upsert")]
            (mt/with-temp [:model/Transform transform (merge-transform-payload target-table)]
              (testing "first run builds the full target"
                (transforms.execute/execute! transform {:run-method :manual})
                (transforms.tu/wait-for-table (:name target-table) 10000)
                (is (= {1 "created", 2 "created", 3 "created"}
                       (target-status-by-order target-table))))
              (testing "new events update existing keys in place and insert new ones"
                (insert-order-status! [[1 "shipped" 4] [4 "created" 5]])
                (transforms.execute/execute! (t2/select-one :model/Transform (:id transform))
                                             {:run-method :manual})
                (is (= {1 "shipped", 2 "created", 3 "created", 4 "created"}
                       (target-status-by-order target-table))
                    "order 1 updated (paid->shipped), order 4 inserted")))))))))

(deftest merge-resolves-field-ids-test
  (testing "after the first build the stored unique key gets its field-ids resolved"
    (mt/test-drivers (test-drivers)
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset merge-test
          (with-transform-cleanup! [target-table (target-table-gen "merge_fieldids")]
            (mt/with-temp [:model/Transform transform (merge-transform-payload target-table)]
              (is (nil? (-> transform :target :target-incremental-strategy :unique-key first :field-id))
                  "no field-id before the first run — the target table doesn't exist yet")
              (transforms.execute/execute! transform {:run-method :manual})
              (transforms.tu/wait-for-table (:name target-table) 10000)
              (let [reloaded      (t2/select-one :model/Transform (:id transform))
                    unique-key    (-> reloaded :target :target-incremental-strategy :unique-key)
                    target-tbl-id (:target_table_id reloaded)
                    expected      (t2/select-one-pk :model/Field :name "order_id"
                                                    :table_id target-tbl-id :active true)]
                (is (= ["order_id"] (mapv :name unique-key)))
                (is (= expected (:field-id (first unique-key)))
                    "field-id resolved to the target's order_id field")))))))))

(deftest merge-composite-key-test
  (testing "a merge transform can upsert on a two-column key"
    (mt/test-drivers (test-drivers)
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset merge-composite-test
          (with-transform-cleanup! [target-table {:type     :table
                                                  :name     "merge_composite"
                                                  :schema   (t2/select-one-fn :schema :model/Table
                                                                              (mt/id :order_region_status))
                                                  :database (mt/id)}]
            (let [q            (fn [f] (sql.u/quote-name driver/*driver* :field f))
                  seq-field-id (t2/select-one-pk :model/Field :name "change_seq"
                                                 :table_id (mt/id :order_region_status))
                  source-query {:database (mt/id)
                                :type     :native
                                :native   {:query         (format "SELECT %s, %s, %s FROM {{t}} AS %s"
                                                                  (q "order_id") (q "region") (q "status") (q "t"))
                                           :template-tags {"t" {:id           "t"
                                                                :name         "t"
                                                                :display-name "T"
                                                                :type         "table"
                                                                :table-id     (mt/id :order_region_status)
                                                                :required     true}}}}
                  payload      {:name               "Composite Merge"
                                :source_database_id (mt/id)
                                :source             {:type                        "query"
                                                     :query                       source-query
                                                     :source-incremental-strategy {:type "checkpoint"
                                                                                   :checkpoint-filter-field-id seq-field-id}}
                                :target             (merge target-table
                                                           {:type                        "table-incremental"
                                                            :target-incremental-strategy {:type "merge"
                                                                                          :unique-key [{:name "order_id"}
                                                                                                       {:name "region"}]}})}
                  insert!      (fn [rows]
                                 (let [[schema tbl] (t2/select-one-fn (juxt :schema :name) :model/Table
                                                                      (mt/id :order_region_status))
                                       spec         (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
                                       values       (str/join ", " (map (fn [[oid rg st sq]]
                                                                          (format "(%d, '%s', '%s', %d)" oid rg st sq))
                                                                        rows))
                                       sql          (format "INSERT INTO %s (%s) VALUES %s"
                                                            (sql.u/quote-name driver/*driver* :table schema tbl)
                                                            (str/join "," (map q ["order_id" "region" "status" "change_seq"]))
                                                            values)]
                                   (driver/execute-raw-queries! driver/*driver* spec [[sql]])))
                  read-target  (fn []
                                 (let [sql  (format "SELECT %s, %s, %s FROM %s"
                                                    (q "order_id") (q "region") (q "status")
                                                    (sql.u/quote-name driver/*driver* :table
                                                                      (:schema target-table) (:name target-table)))
                                       rows (-> (qp/process-query {:database (mt/id) :type :native :native {:query sql}})
                                                :data :rows)]
                                   (into {} (map (fn [[oid rg st]] [[(long oid) rg] st])) rows)))]
              (mt/with-temp [:model/Transform transform payload]
                (testing "first run builds the full target keyed on (order_id, region)"
                  (transforms.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table (:name target-table) 10000)
                  (is (= {[1 "us"] "created", [1 "eu"] "created", [2 "us"] "created"}
                         (read-target))))
                (testing "new events upsert one composite key and insert another"
                  (insert! [[1 "us" "shipped" 4] [3 "us" "created" 5]])
                  (transforms.execute/execute! (t2/select-one :model/Transform (:id transform))
                                               {:run-method :manual})
                  (is (= {[1 "us"] "shipped", [1 "eu"] "created", [2 "us"] "created", [3 "us"] "created"}
                         (read-target))
                      "(1,us) updated, (3,us) inserted; (1,eu) and (2,us) untouched"))))))))))
