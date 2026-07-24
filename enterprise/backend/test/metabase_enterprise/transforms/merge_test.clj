(ns ^:mb/driver-tests metabase-enterprise.transforms.merge-test
  "Tests for the key-based `merge` incremental transform target strategy (upsert/restate)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase.util.date-2 :as u.date]
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

;; Like merge-test but with a temporal checkpoint column (regression coverage for GDGT-2847).
(mt/defdataset merge-temporal-test
  "An event-log dataset whose incremental checkpoint column is a timestamp instead of an integer."
  [["order_status_ts"
    [{:field-name "order_id" :base-type :type/Integer}
     {:field-name "status" :base-type :type/Text}
     {:field-name "changed_at" :base-type :type/DateTime}]
    [[1 "created" #t "2026-01-30T10:00:00"]
     [2 "created" #t "2026-01-31T21:00:04"]
     [3 "created" #t "2026-01-31T21:00:04"]]]])

(mt/defdataset merge-lookback-data
  "An event-log dataset with a timestamp checkpoint column, for the lookback-window test."
  [["order_status_lb"
    [{:field-name "order_id" :base-type :type/Integer}
     {:field-name "status" :base-type :type/Text}
     {:field-name "changed_at" :base-type :type/DateTime}]
    [[1 "created" #t "2026-01-30T10:00:00"]
     [2 "created" #t "2026-01-31T21:00:04"]
     [3 "created" #t "2026-01-31T21:00:04"]]]])

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

(deftest merge-temporal-checkpoint-test
  (testing "a merge transform with a temporal checkpoint column upserts correctly (GDGT-2847)"
    (mt/test-drivers (test-drivers)
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset merge-temporal-test
          (with-transform-cleanup! [target-table {:type     :table
                                                  :name     "merge_temporal"
                                                  :schema   (t2/select-one-fn :schema :model/Table
                                                                              (mt/id :order_status_ts))
                                                  :database (mt/id)}]
            (let [q           (fn [f] (sql.u/quote-name driver/*driver* :field f))
                  ts-field-id (t2/select-one-pk :model/Field :name "changed_at"
                                                :table_id (mt/id :order_status_ts))
                  source-query {:database (mt/id)
                                :type     :native
                                :native   {:query         (format "SELECT %s, %s FROM {{t}} AS %s"
                                                                  (q "order_id") (q "status") (q "t"))
                                           :template-tags {"t" {:id           "t"
                                                                :name         "t"
                                                                :display-name "T"
                                                                :type         "table"
                                                                :table-id     (mt/id :order_status_ts)
                                                                :required     true}}}}
                  payload      {:name               "Temporal Merge"
                                :source_database_id (mt/id)
                                :source             {:type                        "query"
                                                     :query                       source-query
                                                     :source-incremental-strategy {:type "checkpoint"
                                                                                   :checkpoint-filter-field-id ts-field-id}}
                                :target             (merge target-table
                                                           {:type                        "table-incremental"
                                                            :target-incremental-strategy {:type "merge"
                                                                                          :unique-key [{:name "order_id"}]}})}
                  insert!      (fn [rows]
                                 (let [[schema tbl] (t2/select-one-fn (juxt :schema :name) :model/Table
                                                                      (mt/id :order_status_ts))
                                       spec         (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
                                       values       (str/join ", " (map (fn [[oid st ts]]
                                                                          (format "(%d, '%s', '%s')" oid st ts))
                                                                        rows))
                                       sql          (format "INSERT INTO %s (%s) VALUES %s"
                                                            (sql.u/quote-name driver/*driver* :table schema tbl)
                                                            (str/join "," (map q ["order_id" "status" "changed_at"]))
                                                            values)]
                                   (driver/execute-raw-queries! driver/*driver* spec [[sql]])))
                  read-target  (fn []
                                 (let [sql  (format "SELECT %s, %s FROM %s"
                                                    (q "order_id") (q "status")
                                                    (sql.u/quote-name driver/*driver* :table
                                                                      (:schema target-table) (:name target-table)))
                                       rows (-> (qp/process-query {:database (mt/id) :type :native :native {:query sql}})
                                                :data :rows)]
                                   (into {} (map (fn [[oid st]] [(long oid) st])) rows)))]
              (mt/with-temp [:model/Transform transform payload]
                (testing "first run builds the full target"
                  (transforms.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table (:name target-table) 10000)
                  (is (= {1 "created", 2 "created", 3 "created"}
                         (read-target))))
                (testing "a second run with a temporal watermark upserts changed keys and inserts new ones"
                  (insert! [[1 "shipped" "2026-02-01T10:00:00"] [4 "created" "2026-02-02T10:00:00"]])
                  (transforms.execute/execute! (t2/select-one :model/Transform (:id transform))
                                               {:run-method :manual})
                  (is (= {1 "shipped", 2 "created", 3 "created", 4 "created"}
                         (read-target))
                      "order 1 updated, order 4 inserted"))))))))))

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

(deftest merge-lookback-test
  (testing "a lookback window re-reads rows behind the checkpoint so late-arriving data is upserted (GDGT-2868)"
    (mt/test-drivers (test-drivers)
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset merge-lookback-data
          (with-transform-cleanup! [target-table {:type     :table
                                                  :name     "merge_lookback"
                                                  :schema   (t2/select-one-fn :schema :model/Table
                                                                              (mt/id :order_status_lb))
                                                  :database (mt/id)}]
            (let [q            (fn [f] (sql.u/quote-name driver/*driver* :field f))
                  ts-field-id  (t2/select-one-pk :model/Field :name "changed_at"
                                                 :table_id (mt/id :order_status_lb))
                  source-query {:database (mt/id)
                                :type     :native
                                :native   {:query         (format "SELECT %s, %s FROM {{t}} AS %s"
                                                                  (q "order_id") (q "status") (q "t"))
                                           :template-tags {"t" {:id           "t"
                                                                :name         "t"
                                                                :display-name "T"
                                                                :type         "table"
                                                                :table-id     (mt/id :order_status_lb)
                                                                :required     true}}}}
                  payload      {:name               "Lookback Merge"
                                :source_database_id (mt/id)
                                :source             {:type                        "query"
                                                     :query                       source-query
                                                     :source-incremental-strategy {:type "checkpoint"
                                                                                   :checkpoint-filter-field-id ts-field-id
                                                                                   :lookback {:value 1 :unit "day"}}}
                                :target             (merge target-table
                                                           {:type                        "table-incremental"
                                                            :target-incremental-strategy {:type "merge"
                                                                                          :unique-key [{:name "order_id"}]}})}
                  insert!      (fn [rows]
                                 (let [[schema tbl] (t2/select-one-fn (juxt :schema :name) :model/Table
                                                                      (mt/id :order_status_lb))
                                       spec         (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
                                       values       (str/join ", " (map (fn [[oid st ts]]
                                                                          (format "(%d, '%s', '%s')" oid st ts))
                                                                        rows))
                                       sql          (format "INSERT INTO %s (%s) VALUES %s"
                                                            (sql.u/quote-name driver/*driver* :table schema tbl)
                                                            (str/join "," (map q ["order_id" "status" "changed_at"]))
                                                            values)]
                                   (driver/execute-raw-queries! driver/*driver* spec [[sql]])))
                  read-target  (fn []
                                 (let [sql  (format "SELECT %s, %s FROM %s"
                                                    (q "order_id") (q "status")
                                                    (sql.u/quote-name driver/*driver* :table
                                                                      (:schema target-table) (:name target-table)))
                                       rows (-> (qp/process-query {:database (mt/id) :type :native :native {:query sql}})
                                                :data :rows)]
                                   {:by-order (into {} (map (fn [[oid st]] [(long oid) st])) rows)
                                    :count    (count rows)}))
                  delete-order! (fn [order-id]
                                  (let [[schema tbl] (t2/select-one-fn (juxt :schema :name) :model/Table
                                                                       (mt/id :order_status_lb))
                                        spec         (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
                                        sql          (format "DELETE FROM %s WHERE %s = %d"
                                                             (sql.u/quote-name driver/*driver* :table schema tbl)
                                                             (q "order_id") order-id)]
                                    (driver/execute-raw-queries! driver/*driver* spec [[sql]])))
                  watermark    (fn [id] (t2/select-one-fn :last_checkpoint_value :model/Transform id))]
              (mt/with-temp [:model/Transform transform payload]
                (testing "first run builds the full target and records the watermark"
                  (transforms.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table (:name target-table) 10000)
                  (is (= {:by-order {1 "created", 2 "created", 3 "created"} :count 3}
                         (read-target)))
                  (is (some? (watermark (:id transform)))))
                (testing "a late-arriving row older than the watermark but inside the lookback window is picked up"
                  ;; watermark after run 1 is 2026-01-31T21:00:04; a 1-day lookback rescans from
                  ;; 2026-01-30T21:00:04. The late row (order 1, 01-31T00:00) is behind the watermark but
                  ;; inside the window; order 1's original row (01-30T10:00) is outside it.
                  (let [wm-before (watermark (:id transform))]
                    (insert! [[1 "shipped" "2026-01-31T00:00:00"] [4 "created" "2026-02-01T10:00:00"]])
                    (transforms.execute/execute! (t2/select-one :model/Transform (:id transform))
                                                 {:run-method :manual})
                    (is (= {:by-order {1 "shipped", 2 "created", 3 "created", 4 "created"} :count 4}
                           (read-target))
                        "late order 1 upserted, order 4 inserted, re-read rows not duplicated")
                    (testing "the run's recorded lo is the stored watermark pushed back by the lookback"
                      (let [run (t2/select-one :model/TransformRun :transform_id (:id transform)
                                               {:order-by [[:id :desc]]})]
                        (is (= (u.date/format (t/minus (u.date/parse wm-before) (t/days 1)))
                               (:checkpoint_lo_value run)))))))
                (testing "a run with no new rows leaves the target and the watermark unchanged"
                  (let [before (watermark (:id transform))]
                    (transforms.execute/execute! (t2/select-one :model/Transform (:id transform))
                                                 {:run-method :manual})
                    (is (= {:by-order {1 "shipped", 2 "created", 3 "created", 4 "created"} :count 4}
                           (read-target)))
                    (is (= before (watermark (:id transform)))
                        "the watermark must not slide backwards by the lookback window")))
                (testing "deleting the watermark row from the source does not regress the watermark"
                  ;; With order 4 (the row that set the watermark, 02-01T10:00) deleted, max() over
                  ;; the lookback window is orders 2/3 at 01-31T21:00:04 — behind the stored
                  ;; watermark. The new-watermark clamp must keep the old value rather than let it
                  ;; slide back (see get-source-range-params' `hi`).
                  (let [before (watermark (:id transform))]
                    (delete-order! 4)
                    (transforms.execute/execute! (t2/select-one :model/Transform (:id transform))
                                                 {:run-method :manual})
                    (is (= before (watermark (:id transform)))
                        "the watermark must not regress when the max row disappears from the source")
                    (is (= {:by-order {1 "shipped", 2 "created", 3 "created", 4 "created"} :count 4}
                           (read-target))
                        "merge does not propagate source deletes; re-read rows upsert idempotently")))))))))))

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
