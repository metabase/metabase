(ns ^:mb/driver-tests metabase-enterprise.transforms.incremental-test
  "Tests for incremental transforms functionality."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase-enterprise.transforms.util :as transforms.u]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- make-incremental-source-query
  "Create a native query with optional watermark template tag and limit."
  [schema]
  (let [timestamp-sql (first (sql/format [(sql.qp/current-datetime-honeysql-form driver/*driver*)]))
        query (format "SELECT *, %s AS load_timestamp FROM %s [[WHERE id > {{watermark}}]] [[LIMIT {{limit}}]]"
                      timestamp-sql
                      (if schema
                        (sql.u/quote-name driver/*driver* :table schema "transforms_products")
                        "transforms_products"))]
    (-> (lib/native-query meta/metadata-provider query)
        (dissoc :lib/metadata)
        (assoc :database (mt/id)))))

(defn- make-incremental-mbql-query
  "Create an MBQL query for incremental transforms."
  []
  (mt/mbql-query transforms_products {:expressions {"load_timestamp" [:now]}}))

(def incremental-python-body
  "Create Python code that returns all products for incremental transforms."
  (str "import pandas as pd\n"
       "from datetime import datetime\n"
       "\n"
       "def transform(transforms_products):\n"
       "    transforms_products['load_timestamp'] = datetime.now()\n"
       "    return transforms_products"))

(defn- make-incremental-transform-payload
  "Create a transform payload for incremental transform testing.

  transform-type can be :native, :mbql, or :python
  limit specifies the query-limit for incremental strategies"
  [transform-name target-table-name keyset-column transform-type limit]
  (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
    {:name transform-name
     :source (case transform-type
               :native {:type "query"
                        :query (make-incremental-source-query schema)
                        :source-incremental-strategy {:type "keyset"
                                                      :query-limit limit
                                                      :keyset-column keyset-column}}
               :mbql {:type "query"
                      :query (make-incremental-mbql-query)
                      :source-incremental-strategy {:type "keyset"
                                                    :query-limit limit
                                                    :keyset-filter-unique-key "column-unique-key-v1$id"
                                                    :keyset-column keyset-column}}
               :python {:type "python"
                        :source-tables {"transforms_products" (mt/id :transforms_products)}
                        :body incremental-python-body
                        :source-incremental-strategy {:type "keyset"
                                                      :keyset-filter-unique-key "column-unique-key-v1$id"
                                                      :keyset-column keyset-column
                                                      :query-limit limit}})
     :target {:type "table-incremental"
              :schema schema
              :name target-table-name
              :database (mt/id)
              :target-incremental-strategy {:type "append"}}}))

(defn- get-table-row-count
  "Get the row count of a table by name."
  [table-name]
  (let [table          (t2/select-one :model/Table :name table-name)
        mp             (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (:id table))
        count-query    (lib/aggregate (lib/query mp table-metadata) (lib/count))
        result         (qp/process-query count-query)]
    (some-> result :data :rows first first bigint)))

(defn- get-distinct-timestamp-count
  "Get the count of distinct load_timestamp values in a table."
  [table-name]
  (let [table (t2/select-one :model/Table :name table-name)
        native-query {:database (mt/id)
                      :type :native
                      :native {:query (format "SELECT COUNT(DISTINCT load_timestamp) FROM %s"
                                              (sql.u/quote-name driver/*driver* :table
                                                                (:schema table)
                                                                table-name))}}
        result (qp/process-query native-query)]
    (some-> result :data :rows first first bigint)))

(def get-watermark-value #'transforms.u/next-watermark-value)

(defn- insert-test-products!
  "Insert new products into the transforms_products table."
  [products]
  (let [[schema source-table-name] (t2/select-one-fn (juxt :schema :name) :model/Table (mt/id :transforms_products))
        spec (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
        schema-prefix (if schema (str schema ".") "")
        values-list (str/join ", "
                              (map (fn [{:keys [name category price created-at]}]
                                     (format "('%s', '%s', %s, '%s')" name category price created-at))
                                   products))
        insert-sql (format "INSERT INTO %s%s (name, category, price, created_at) VALUES %s"
                           schema-prefix
                           source-table-name
                           values-list)]
    (driver/execute-raw-queries! driver/*driver* spec [[insert-sql]])))

(defn- delete-test-products!
  [products]
  (let [[schema source-table-name] (t2/select-one-fn (juxt :schema :name) :model/Table (mt/id :transforms_products))
        spec (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
        schema-prefix (if schema (str schema ".") "")
        delete-sql (format "DELETE FROM %s%s WHERE name IN (%s)"
                           schema-prefix
                           source-table-name
                           (str/join ", " (map (constantly "?") products)))]
    (driver/execute-raw-queries! driver/*driver* spec [[delete-sql (mapv :name products)]])))

(defmacro with-insert-test-products! [products & body]
  `(let [products# ~products]
     (try
       (insert-test-products! products#)
       ~@body
       (finally
         (delete-test-products! products#)))))

(set! *warn-on-reflection* true)

(deftest create-incremental-transform-test
  (testing "Creating an incremental transform with keyset strategy"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "incremental_test"]
            (let [transform-payload (make-incremental-transform-payload "Test Incremental Transform" target-table "id" :native 2)]
              (testing "Transform is created successfully"
                (mt/with-temp [:model/Transform transform transform-payload]
                  (is (some? (:id transform)))
                  (is (= "Test Incremental Transform" (:name transform)))
                  (is (= "table-incremental" (-> transform :target :type)))
                  (is (= "keyset" (-> transform :source :source-incremental-strategy :type)))
                  (is (= "id" (-> transform :source :source-incremental-strategy :keyset-column)))

                  (testing "No watermark exists initially"
                    (is (nil? (get-watermark-value (:id transform)))))

                  (testing "Can retrieve transform via API"
                    (let [retrieved (mt/user-http-request :crowberto :get 200 (format "ee/transform/%d" (:id transform)))]
                      (is (= (:id transform) (:id retrieved)))
                      (is (= "Test Incremental Transform" (:name retrieved)))))

                  (testing "Transform appears in list endpoint"
                    (let [transforms (mt/user-http-request :crowberto :get 200 "ee/transform")
                          our-transform (first (filter #(= (:id transform) (:id %)) transforms))]
                      (is (some? our-transform))
                      (is (= "Test Incremental Transform" (:name our-transform))))))))))))))

(deftest run-incremental-transform-twice-test
  (testing "Running an incremental transform twice processes only new data on second run"
    (doseq [transform-type [:native :mbql :python]]
      (testing (format "with %s transform" (name transform-type))
        (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "incremental_twice"]
                (let [transform-payload (make-incremental-transform-payload "Incremental Transform" target-table "id" transform-type 10)]
                  (mt/with-temp [:model/Transform transform transform-payload]
                    (testing "First run processes all data"
                      (transforms.i/execute! transform {:run-method :manual})
                      (transforms.tu/wait-for-table target-table 10000)
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 10 row-count) "First run should process the first 10 products")
                        (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")

                        (testing "Watermark is created after first run"
                          (let [watermark (get-watermark-value (:id transform))]
                            (is (= 10 watermark) "Watermark should be MAX(id) = 10")))))

                    (testing "Second run should process the remaining rows"
                      (transforms.i/execute! transform {:run-method :manual})
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 16 row-count) "Second run should add remaining 6 rows")
                        (is (= 2 distinct-timestamps) "Should have 2 distinct timestamps (one per incremental run)")
                        (let [watermark (get-watermark-value (:id transform))]
                          (is (= 16 watermark) "Watermark should be 16"))))))))))))))

(deftest switch-incremental-to-non-incremental-test
  (testing "Switching an incremental transform to non-incremental overwrites data"
    (doseq [transform-type [:native :mbql :python]]
      (testing (format "with %s transform" (name transform-type))
        (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "switch_incr_to_non_incr"]
                (let [initial-payload (make-incremental-transform-payload "Switch Transform" target-table "id" transform-type 10)]
                  (mt/with-temp [:model/Transform transform initial-payload]
                    (testing "Initial incremental run processes first batch"
                      (transforms.i/execute! transform {:run-method :manual})
                      (transforms.tu/wait-for-table target-table 10000)
                      (let [row-count           (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)
                            watermark           (get-watermark-value (:id transform))]
                        (is (= 10 row-count) "Initial run should process first 10 products")
                        (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")
                        (is (= 10 watermark) "Watermark should be created")))

                    (testing "Second incremental run processes remaining data"
                      (transforms.i/execute! transform {:run-method :manual})
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 16 row-count) "Should have 16 rows after second incremental run")
                        (is (= 2 distinct-timestamps) "Should have 2 distinct timestamps (one per incremental run)")))

                    (testing "Switch to non-incremental via PUT API"
                      (let [non-incremental-payload (-> initial-payload
                                                        (update :source dissoc :source-incremental-strategy)
                                                        (update :target dissoc :source-incremental-strategy)
                                                        (update :target assoc :type "table"))
                            updated (mt/user-http-request :crowberto :put 200 (format "ee/transform/%d" (:id transform))
                                                          non-incremental-payload)]
                        (is (= "table" (-> updated :target :type)))
                        (is (nil? (-> updated :source :source-incremental-strategy)))))

                    (testing "Non-incremental run overwrites all data"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (transforms.i/execute! transform {:run-method :manual})
                        (let [row-count (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)]
                          (is (= 16 row-count) "Should overwrite to 16 rows (all original products)")
                          (is (= 1 distinct-timestamps) "All rows should have same timestamp after non-incremental overwrite"))

                        (testing "Running again still overwrites"
                          (transforms.i/execute! transform {:run-method :manual})
                          (let [row-count (get-table-row-count target-table)
                                distinct-timestamps (get-distinct-timestamp-count target-table)]
                            (is (= 16 row-count) "Should still have 16 rows after another run")
                            (is (= 1 distinct-timestamps) "Should still have 1 distinct timestamp")))))))))))))))

(deftest switch-non-incremental-to-incremental-test
  (testing "Switching a non-incremental transform to incremental computes watermark from existing data"
    (doseq [transform-type [:native :mbql :python]]
      (testing (format "with %s transform" (name transform-type))
        (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "switch_non_incr_to_incr"]
                (let [incremental-payload (make-incremental-transform-payload "Switch Transform" target-table "id" transform-type 10)
                      initial-payload (-> incremental-payload
                                          (update :source dissoc :source-incremental-strategy)
                                          (update :target dissoc :source-incremental-strategy)
                                          (update :target assoc :type "table"))]
                  (mt/with-temp [:model/Transform transform initial-payload]
                    (testing "Initial non-incremental run creates table"
                      (transforms.i/execute! transform {:run-method :manual})
                      (transforms.tu/wait-for-table target-table 10000)
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 16 row-count) "Initial run should process all 16 products")
                        (is (= 1 distinct-timestamps) "All rows should have same timestamp from non-incremental run")

                        (testing "No watermark exists"
                          (let [watermark (get-watermark-value (:id transform))]
                            (is (nil? watermark) "No watermark for non-incremental transform")))))

                    (testing "Switch to incremental via PUT API"
                      (let [updated (mt/user-http-request :crowberto :put 200 (format "ee/transform/%d" (:id transform))
                                                          incremental-payload)]
                        (is (= "table-incremental" (-> updated :target :type)))
                        (is (= "keyset" (-> updated :source :source-incremental-strategy :type)))))

                    (testing "First incremental run after switch processes no new data"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (transforms.i/execute! transform {:run-method :manual})
                        (let [row-count           (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)
                              watermark           (get-watermark-value (:id transform))]
                          (is (= 16 row-count) "Should still have 16 rows (no duplicates)")
                          (is (= 1 distinct-timestamps) "Should still have 1 distinct timestamp (no new data added)")
                          (is (= 16 watermark) "Watermark should be computed from existing data"))))

                    (when-not (= driver/*driver* :clickhouse) ; struggles with eventual consistency
                      (testing "Add new data and run incrementally"
                        (with-insert-test-products!
                          [{:name "After Switch Product"
                            :category "Gadget"
                            :price 79.99
                            :created-at "2024-01-20T10:00:00"}]

                          (let [transform (t2/select-one :model/Transform (:id transform))]
                            (transforms.i/execute! transform {:run-method :manual})
                            (let [row-count (get-table-row-count target-table)
                                  watermark (get-watermark-value (:id transform))]
                              (is (= 17 row-count) "Should append 1 new row (16 + 1 = 17)")
                              (is (>= watermark 17) "Watermark should be updated to at least 17"))))))))))))))))

(deftest flush-watermark-test
  (testing "Flushing a watermark causes the next run to reprocess all data"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "flush_watermark_test"]
            (let [transform-payload (make-incremental-transform-payload "Flush Watermark Transform" target-table "id" :native 2)]
              (mt/with-temp [:model/Transform transform transform-payload]
                (testing "First run processes all data and creates watermark"
                  (transforms.i/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table target-table 10000)
                  (let [row-count (get-table-row-count target-table)
                        watermark (get-watermark-value (:id transform))]
                    (is (= 16 row-count) "First run should process all 16 products")
                    (is (= 16 watermark) "Watermark should be MAX(id) = 16")))

                (testing "Second run with no new data processes nothing (fixpoint)"
                  (transforms.i/execute! transform {:run-method :manual})
                  (let [row-count (get-table-row-count target-table)]
                    (is (= 16 row-count) "Second run should not add any rows")))

                (testing "Flush watermark via API"
                  (mt/user-http-request :crowberto :post 204 (format "ee/transform/%d/flush-watermark" (:id transform)))
                  (let [watermark (get-watermark-value (:id transform))]
                    (is (nil? watermark) "Watermark should be deleted after flush")))

                (testing "Run after flush reprocesses all data"
                  (let [transform (t2/select-one :model/Transform (:id transform))]
                    (transforms.i/execute! transform {:run-method :manual})
                    (let [row-count (get-table-row-count target-table)
                          watermark (get-watermark-value (:id transform))]
                      (is (= 32 row-count) "Should append all 16 products again (16 + 16 = 32)")
                      (is (= 16 watermark) "Watermark should be recomputed to MAX(id) = 16"))))

                (testing "Cannot flush watermark for non-incremental transform"
                  (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                        non-incremental-payload {:source {:type "query"
                                                          :query (make-incremental-source-query schema)}
                                                 :target {:type "table"
                                                          :schema schema
                                                          :name target-table}}]
                    (mt/user-http-request :crowberto :put 200 (format "ee/transform/%d" (:id transform))
                                          non-incremental-payload)
                    (is (= "Only transforms with keyset incremental strategy can have their watermark flushed."
                           (mt/user-http-request :crowberto :post 400 (format "ee/transform/%d/flush-watermark" (:id transform))))
                        "Should return 400 for non-keyset incremental transform")))))))))))

;; TODO: test changing keyset
