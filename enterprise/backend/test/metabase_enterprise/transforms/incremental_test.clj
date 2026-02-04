(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms.incremental-test
  "Tests for incremental transforms functionality."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase.transforms.util :as transforms.u]
   [next.jdbc :as next.jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

(def checkpoint-configs
  {:integer {:field-name "id"
             :template-tag-type :number
             :lib-column-key "column-unique-key-v1$id"
             :expected-initial-checkpoint 10
             :expected-second-checkpoint 16}
   :float {:field-name "price"
           :template-tag-type :number
           :lib-column-key "column-unique-key-v1$price"
           :expected-initial-checkpoint 49.99
           :expected-second-checkpoint 199.99}
   :temporal {:field-name "created_at"
              :template-tag-type :text
              :lib-column-key "column-unique-key-v1$created_at"
              :expected-initial-checkpoint "2024-01-10"
              :expected-second-checkpoint "2024-01-16"}})

(defn- valid-checkpoint-transform-combo?
  "Check if a checkpoint type and transform type combination is valid. "
  [checkpoint-type transform-type]
  (not (and (= checkpoint-type :temporal)
            (= transform-type :native))))

(defn- build-table-query-with-order-by
  "Wraps the original build-table-query to add ORDER BY for deterministic test results."
  [original-fn table-id source-incremental-strategy transform-id limit checkpoint-field]
  (let [query (original-fn table-id source-incremental-strategy transform-id limit)
        db-id (t2/select-one-fn :db_id (t2/table-name :model/Table) :id table-id)
        metadata-provider (lib-be/application-database-metadata-provider db-id)
        ;; Find the checkpoint field in the table metadata
        checkpoint-col (->> (lib.metadata/fields metadata-provider table-id)
                            (filter #(= (:name %) checkpoint-field))
                            first)]
    (if checkpoint-col
      (lib/order-by query checkpoint-col)
      query)))

(defmacro with-python-order-by!
  "Execute body with python-runner/build-table-query redef'd to include ORDER BY for deterministic test results."
  [checkpoint-field & body]
  `(let [original-fn# @#'python-runner/build-table-query]
     (with-redefs [python-runner/build-table-query
                   (fn [table-id# source-incremental-strategy# transform-id# limit#]
                     (build-table-query-with-order-by original-fn# table-id# source-incremental-strategy# transform-id# limit# ~checkpoint-field))]
       ~@body)))

(defn- execute-transform-with-ordering!
  "Execute a transform, wrapping Python transforms with ORDER BY redefinition for deterministic results."
  [transform transform-type checkpoint-field run-opts]
  (if (= transform-type :python)
    (with-python-order-by! checkpoint-field
      (transforms.execute/execute! transform run-opts))
    (transforms.execute/execute! transform run-opts)))

(defn- make-incremental-source-query
  "Create a native query with optional checkpoint template tag."
  [schema checkpoint-config]
  (let [{:keys [field-name template-tag-type]} checkpoint-config
        timestamp-sql (first (sql/format (sql.qp/current-datetime-honeysql-form driver/*driver*)))
        query (format "SELECT *, %s AS %s FROM %s [[WHERE %s > {{checkpoint}}]] ORDER BY %s LIMIT 10"
                      timestamp-sql
                      (sql.u/quote-name driver/*driver* :field "load_timestamp")
                      (if schema
                        (sql.u/quote-name driver/*driver* :table schema "transforms_products")
                        "transforms_products")
                      (sql.u/quote-name driver/*driver* :field field-name)
                      (sql.u/quote-name driver/*driver* :field field-name))]
    {:database (mt/id)
     :type :native
     :native {:query query
              :template-tags {"checkpoint" {:id "checkpoint"
                                            :name "checkpoint"
                                            :display-name "Checkpoint"
                                            :type template-tag-type
                                            :required false}}}}))

(defn- make-incremental-source-query-without-template-tag
  "Create a native query without template tags for testing automatic checkpoint insertion. "
  [schema]
  (let [timestamp-sql (first (sql/format (sql.qp/current-datetime-honeysql-form driver/*driver*)))
        query (format "SELECT *, %s AS %s FROM %s"
                      timestamp-sql
                      (sql.u/quote-name driver/*driver* :field "load_timestamp")
                      (if schema
                        (sql.u/quote-name driver/*driver* :table schema "transforms_products")
                        "transforms_products"))]
    {:database (mt/id)
     :type :native
     :native {:query query}}))

(defn- make-incremental-mbql-query
  "Create an MBQL query for incremental transforms. "
  [checkpoint-config]
  (let [{:keys [field-name]} checkpoint-config]
    (mt/mbql-query transforms_products {:expressions {"load_timestamp" [:now]}
                                        :order-by [[:asc [:field (mt/id :transforms_products (keyword field-name))]]]
                                        :limit 10})))

(def incremental-python-body
  (str "import pandas as pd\n"
       "from datetime import datetime\n"
       "\n"
       "def transform(transforms_products):\n"
       "    transforms_products['load_timestamp'] = datetime.now()\n"
       "    return transforms_products"))

(defn- make-incremental-transform-payload
  "Create a transform payload for incremental transform testing.

  transform-type can be :native, :native-auto-wrap, :mbql, or :python
  checkpoint-config should be from checkpoint-configs"
  [transform-name target-table-name transform-type checkpoint-config]
  (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
        {:keys [field-name lib-column-key]} checkpoint-config]
    {:name transform-name
     :source_database_id (mt/id)
     :source (case transform-type
               :native {:type "query"
                        :query (make-incremental-source-query schema checkpoint-config)
                        :source-incremental-strategy {:type "checkpoint"
                                                      :checkpoint-filter field-name}}
               :native-auto-wrap {:type "query"
                                  :query (make-incremental-source-query-without-template-tag schema)
                                  :source-incremental-strategy {:type "checkpoint"
                                                                :checkpoint-filter field-name}}
               :mbql {:type "query"
                      :query (make-incremental-mbql-query checkpoint-config)
                      :source-incremental-strategy {:type "checkpoint"
                                                    :checkpoint-filter-unique-key lib-column-key}}
               :python {:type "python"
                        :source-tables {"transforms_products" (mt/id :transforms_products)}
                        :limit 10
                        :body incremental-python-body
                        :source-incremental-strategy {:type "checkpoint"
                                                      :checkpoint-filter-unique-key lib-column-key}})
     :target {:type "table-incremental"
              :schema schema
              :name target-table-name
              :database (mt/id)
              :target-incremental-strategy {:type "append"}}}))

(defn- get-table-row-count
  "Get the row count of a table by name."
  [table-name]
  (let [table (t2/select-one :model/Table :name table-name)
        mp (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (:id table))
        count-query (lib/aggregate (lib/query mp table-metadata) (lib/count))
        result (qp/process-query count-query)]
    (some-> result :data :rows first first bigint)))

(defn- get-distinct-timestamp-count
  "Get the count of distinct load_timestamp values in a table."
  [table-name]
  (let [table (t2/select-one :model/Table :name table-name)
        native-query {:database (mt/id)
                      :type :native
                      :native {:query (format "SELECT COUNT(DISTINCT %s) FROM %s"
                                              (sql.u/quote-name driver/*driver* :field "load_timestamp")
                                              (sql.u/quote-name driver/*driver* :table
                                                                (:schema table)
                                                                table-name))}}
        result (qp/process-query native-query)]
    (some-> result :data :rows first first bigint)))

(defn get-checkpoint-value [transform]
  (#'transforms.u/next-checkpoint-value
   (transforms.u/next-checkpoint transform)))

(defn- compare-checkpoint-values
  "Compare two checkpoint values with type-appropriate logic. "
  [checkpoint-type expected actual]
  (case checkpoint-type
    :integer (= (bigint expected) (bigint actual))
    :float (and (number? actual)
                (< (Math/abs (- expected actual)) 0.01))
    :temporal (and (string? actual)
                   (str/starts-with? actual expected))))

(defn- insert-test-products!
  "Insert new products into the transforms_products table."
  [products]
  (let [[schema source-table-name] (t2/select-one-fn (juxt :schema :name) :model/Table (mt/id :transforms_products))
        spec (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
        values-list (str/join ", "
                              (map (fn [{:keys [name category price created-at]}]
                                     (format "('%s', '%s', %s, '%s')" name category price created-at))
                                   products))
        insert-sql (format "INSERT INTO %s (%s) VALUES %s"
                           (sql.u/quote-name driver/*driver* :table schema source-table-name)
                           (str/join "," (map #(sql.u/quote-name driver/*driver* :field %) ["name" "category" "price" "created_at"]))
                           values-list)]
    (driver/execute-raw-queries! driver/*driver* spec [[insert-sql]])))

(defn- delete-test-products!
  [products]
  (let [[schema source-table-name] (t2/select-one-fn (juxt :schema :name) :model/Table (mt/id :transforms_products))
        spec (sql-jdbc.conn/db->pooled-connection-spec (mt/id))
        delete-sql (format "DELETE FROM %s WHERE %s IN (%s)"
                           (sql.u/quote-name driver/*driver* :table schema source-table-name)
                           (sql.u/quote-name driver/*driver* :field "name")
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

(defn- test-drivers []
  (disj (mt/normal-drivers-with-feature :transforms/table) :redshift :clickhouse :sqlserver))

(deftest create-incremental-transform-test
  (testing "Creating an incremental transform with checkpoint strategy"
    (doseq [checkpoint-type [:integer :float]
            :let [transform-type :native]]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "incremental_test"]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [field-name]} checkpoint-config
                      transform-payload (make-incremental-transform-payload "Test Incremental Transform" target-table :native checkpoint-config)]
                  (testing "Transform is created successfully"
                    (mt/with-temp [:model/Transform transform transform-payload]
                      (is (some? (:id transform)))
                      (is (= "Test Incremental Transform" (:name transform)))
                      (is (= "table-incremental" (-> transform :target :type)))
                      (is (= "checkpoint" (-> transform :source :source-incremental-strategy :type)))
                      (is (= field-name (-> transform :source :source-incremental-strategy :checkpoint-filter)))

                      (testing "No checkpoint exists initially"
                        (is (nil? (get-checkpoint-value transform))))

                      (testing "Can retrieve transform via API"
                        (let [retrieved (mt/user-http-request :crowberto :get 200 (format "transform/%d" (:id transform)))]
                          (is (= (:id transform) (:id retrieved)))
                          (is (= "Test Incremental Transform" (:name retrieved)))))

                      (testing "Transform appears in list endpoint"
                        (let [transforms (mt/user-http-request :crowberto :get 200 "transform")
                              our-transform (first (filter #(= (:id transform) (:id %)) transforms))]
                          (is (some? our-transform))
                          (is (= "Test Incremental Transform" (:name our-transform))))))))))))))))

(deftest run-incremental-transform-twice-test
  (testing "Running an incremental transform twice processes only new data on second run"
    (doseq [checkpoint-type [:integer :float :temporal]
            transform-type [:native :mbql :python]
            :when (valid-checkpoint-transform-combo? checkpoint-type transform-type)]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "incremental_twice"]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [expected-initial-checkpoint expected-second-checkpoint]} checkpoint-config
                      transform-payload (make-incremental-transform-payload "Incremental Transform" target-table transform-type checkpoint-config)]
                  (mt/with-temp [:model/Transform transform transform-payload]
                    (testing "First run processes all data"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (transforms.tu/wait-for-table target-table 10000)
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 10 row-count) "First run should process the first 10 products")
                        (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")

                        (testing "Checkpoint is created after first run"
                          (let [checkpoint (get-checkpoint-value transform)]
                            (is (compare-checkpoint-values checkpoint-type expected-initial-checkpoint checkpoint)
                                (format "Checkpoint should be MAX(%s) from first 10 rows" (:field-name checkpoint-config)))))))

                    (testing "Second run should process the remaining rows"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 16 row-count) "Second run should add remaining 6 rows")
                        (is (= 2 distinct-timestamps) "Should have 2 distinct timestamps (one per incremental run)")
                        (let [checkpoint (get-checkpoint-value transform)]
                          (is (compare-checkpoint-values checkpoint-type expected-second-checkpoint checkpoint)
                              (format "Checkpoint should be MAX(%s) from all 16 rows" (:field-name checkpoint-config))))))))))))))))

(deftest switch-incremental-to-non-incremental-test
  (testing "Switching an incremental transform to non-incremental overwrites data"
    (doseq [checkpoint-type [:integer :float :temporal]
            transform-type [:native :mbql :python]
            :when (valid-checkpoint-transform-combo? checkpoint-type transform-type)]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (disj (test-drivers) :bigquery-cloud-sdk) ; will follow up with a fix via GDGT-1777
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "switch_incr_to_non_incr"]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [expected-initial-checkpoint]} checkpoint-config
                      initial-payload (make-incremental-transform-payload "Switch Transform" target-table transform-type checkpoint-config)]
                  (mt/with-temp [:model/Transform transform initial-payload]
                    (testing "Initial incremental run processes first batch"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (transforms.tu/wait-for-table target-table 10000)
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)
                            checkpoint (get-checkpoint-value transform)]
                        (is (= 10 row-count) "Initial run should process first 10 products")
                        (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")
                        (is (compare-checkpoint-values checkpoint-type expected-initial-checkpoint checkpoint) "Checkpoint should be created")))

                    (testing "Second incremental run processes remaining data"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 16 row-count) "Should have 16 rows after second incremental run")
                        (is (= 2 distinct-timestamps) "Should have 2 distinct timestamps (one per incremental run)")))

                    (testing "Switch to non-incremental via PUT API"
                      (let [non-incremental-payload (-> initial-payload
                                                        (update :source dissoc :source-incremental-strategy)
                                                        (update :target dissoc :source-incremental-strategy)
                                                        (update :target assoc :type "table"))
                            updated (mt/user-http-request :crowberto :put 200 (format "transform/%d" (:id transform))
                                                          non-incremental-payload)]
                        (is (= "table" (-> updated :target :type)))
                        (is (nil? (-> updated :source :source-incremental-strategy)))))

                    (testing "Non-incremental run overwrites all data"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                        (let [row-count (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)]
                          (is (= 10 row-count) "Should overwrite to 10 rows")
                          (is (= 1 distinct-timestamps) "All rows should have same timestamp after non-incremental overwrite"))

                        (testing "Running again still overwrites"
                          (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                          (let [row-count (get-table-row-count target-table)
                                distinct-timestamps (get-distinct-timestamp-count target-table)]
                            (is (= 10 row-count) "Should still have 10 rows after another run")
                            (is (= 1 distinct-timestamps) "Should still have 1 distinct timestamp")))))))))))))))

(deftest switch-non-incremental-to-incremental-test
  (testing "Switching a non-incremental transform to incremental computes checkpoint from existing data"
    (doseq [checkpoint-type [:integer :float :temporal]
            transform-type [:native :mbql :python]
            :when (valid-checkpoint-transform-combo? checkpoint-type transform-type)]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "switch_non_incr_to_incr"]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [expected-second-checkpoint]} checkpoint-config
                      incremental-payload (make-incremental-transform-payload "Switch Transform" target-table transform-type checkpoint-config)
                      initial-payload (-> incremental-payload
                                          (update :source dissoc :source-incremental-strategy)
                                          (update :target dissoc :source-incremental-strategy)
                                          (update :target assoc :type "table"))]
                  (mt/with-temp [:model/Transform transform initial-payload]
                    (testing "Initial non-incremental run creates table"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (transforms.tu/wait-for-table target-table 10000)
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 10 row-count) "Initial run should process 10 products")
                        (is (= 1 distinct-timestamps) "All rows should have same timestamp from non-incremental run")

                        (testing "No checkpoint exists"
                          (let [checkpoint (get-checkpoint-value transform)]
                            (is (nil? checkpoint) "No checkpoint for non-incremental transform")))))

                    (testing "Switch to incremental via PUT API"
                      (let [updated (mt/user-http-request :crowberto :put 200 (format "transform/%d" (:id transform))
                                                          incremental-payload)]
                        (is (= "table-incremental" (-> updated :target :type)))
                        (is (= "checkpoint" (-> updated :source :source-incremental-strategy :type)))))

                    (testing "First incremental run after switch processes no new data"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                        (let [row-count (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)
                              checkpoint (get-checkpoint-value transform)]
                          (is (= 16 row-count) "Should process remaining 6 entries")
                          (is (= 2 distinct-timestamps) "Should have 2 distinct timestamp")
                          (is (compare-checkpoint-values checkpoint-type expected-second-checkpoint checkpoint) "Checkpoint should be computed from existing data"))))

                    (when (and (isa? driver/hierarchy driver/*driver* :sql-jdbc) ; insert/delete test products only works for jdbc drivers at the moment
                               (not= driver/*driver* :clickhouse)
                               ;; this *should* work see #68965 for context, will plan follow-up task
                               (not= driver/*driver* :snowflake))
                      (testing "Add new data and run incrementally"
                        (with-insert-test-products!
                          [{:name "After Switch Product"
                            :category "Gadget"
                            :price 379.99
                            :created-at "2024-01-20T10:00:00"}]
                          (let [transform (t2/select-one :model/Transform (:id transform))]
                            (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                            (let [row-count (get-table-row-count target-table)
                                  checkpoint (get-checkpoint-value transform)]
                              (is (= 17 row-count) "Should append 1 new row (16 + 1 = 17)")
                              ;; For integer checkpoints, we can verify exact value >= 17
                              ;; For float/temporal, just verify checkpoint exists
                              (is (some? checkpoint) "Checkpoint should be updated"))))))))))))))))

(deftest native-query-without-template-tag-test
  (testing "Native query without template tags uses automatic checkpoint wrapping"
    (doseq [checkpoint-type [:integer :float :temporal]]
      (testing (format "with %s checkpoint" (name checkpoint-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "native_no_template"]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [expected-second-checkpoint field-name]} checkpoint-config
                      schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                      transform-payload {:name "Native Without Template Tag"
                                         :source {:type "query"
                                                  :query (make-incremental-source-query-without-template-tag schema)
                                                  :source-incremental-strategy {:type "checkpoint"
                                                                                :checkpoint-filter field-name}}
                                         :target {:type "table-incremental"
                                                  :schema schema
                                                  :name target-table
                                                  :database (mt/id)
                                                  :target-incremental-strategy {:type "append"}}}]
                  (mt/with-temp [:model/Transform transform transform-payload]
                    (testing "First run processes all existing data"
                      (transforms.execute/execute! transform {:run-method :manual})
                      (transforms.tu/wait-for-table target-table 10000)
                      (let [row-count (get-table-row-count target-table)
                            checkpoint (get-checkpoint-value transform)]
                        (is (= 16 row-count) "First run should process all 16 products")
                        (is (compare-checkpoint-values checkpoint-type expected-second-checkpoint checkpoint)
                            (format "Checkpoint should be MAX(%s) = %s" (:field-name checkpoint-config) expected-second-checkpoint))))

                    (testing "Second run without new data adds nothing"
                      (transforms.execute/execute! transform {:run-method :manual})
                      (let [row-count (get-table-row-count target-table)]
                        (is (= 16 row-count) "Should still have 16 rows, no new data")))

                    (when (and (isa? driver/hierarchy driver/*driver* :sql-jdbc) ; insert/delete test products only works for jdbc drivers at the moment
                               (not= driver/*driver* :clickhouse)
                               ;; this *should* work see #68965 for context, will plan follow-up task
                               (not= driver/*driver* :snowflake))
                      (testing "After inserting new data, incremental run appends only new rows"
                        (with-insert-test-products!
                          [{:name "New Product 1"
                            :category "Electronics"
                            :price 299.99
                            :created-at "2024-01-21T10:00:00"}
                           {:name "New Product 2"
                            :category "Books"
                            :price 319.99
                            :created-at "2024-01-21T11:00:00"}]

                          (transforms.execute/execute! transform {:run-method :manual})
                          (let [row-count (get-table-row-count target-table)
                                checkpoint (get-checkpoint-value transform)]
                            (is (= 18 row-count) "Should append 2 new rows (16 + 2 = 18)")
                            (is (some? checkpoint) "Checkpoint should be updated")))))))))))))))

(deftest unsupported-checkpoint-column-type-test
  (testing "Transform fails at runtime with unsupported checkpoint column type"
    (mt/test-drivers #{:h2 :postgres}
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "unsupported_type_test"]
            (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                  ;; Create transform with text column (unsupported type) as checkpoint
                  transform-payload {:name "Invalid Checkpoint Type Transform"
                                     :source {:type "query"
                                              :query (make-incremental-source-query-without-template-tag schema)
                                              :source-incremental-strategy {:type "checkpoint"
                                                                            :checkpoint-filter "name"}}
                                     :target {:type "table-incremental"
                                              :schema schema
                                              :name target-table
                                              :database (mt/id)
                                              :target-incremental-strategy {:type "append"}}}]
              (testing "API validation rejects unsupported checkpoint column type"
                (let [response (mt/user-http-request :crowberto :post 400 "transform" transform-payload)]
                  (is (string? response))
                  (is (re-find #"unsupported type" response)))))))))))

(deftest ^:postgres-only native-query-with-temporal-checkpoint-test
  (testing "Native query with temporal checkpoint"
    ;; we test only in postgres because it's easy to cast to ::timestamp
    (mt/test-drivers [:postgres]
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "native_temporal_cast"]
            (let [checkpoint-config (get checkpoint-configs :temporal)
                  {:keys [expected-initial-checkpoint expected-second-checkpoint field-name]} checkpoint-config
                  schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                  timestamp-sql (first (sql/format (sql.qp/current-datetime-honeysql-form driver/*driver*)))
                  query (format "SELECT *, %s AS load_timestamp FROM %s [[WHERE %s > {{checkpoint}}::timestamp]] ORDER BY %s LIMIT 10"
                                timestamp-sql
                                (if schema
                                  (sql.u/quote-name driver/*driver* :table schema "transforms_products")
                                  "transforms_products")
                                field-name
                                field-name)
                  transform-payload {:name "Native With Temporal Cast"
                                     :source {:type "query"
                                              :query {:database (mt/id)
                                                      :type :native
                                                      :native {:query query
                                                               :template-tags {"checkpoint" {:id "checkpoint"
                                                                                             :name "checkpoint"
                                                                                             :display-name "Checkpoint"
                                                                                             :type :text
                                                                                             :required false}}}}
                                              :source-incremental-strategy {:type "checkpoint"
                                                                            :checkpoint-filter field-name}}
                                     :target {:type "table-incremental"
                                              :schema schema
                                              :name target-table
                                              :database (mt/id)
                                              :target-incremental-strategy {:type "append"}}}]
              (mt/with-temp [:model/Transform transform transform-payload]
                (testing "First run processes first batch"
                  (transforms.execute/execute! transform {:run-method :manual})
                  (transforms.tu/wait-for-table target-table 10000)
                  (let [row-count (get-table-row-count target-table)
                        distinct-timestamps (get-distinct-timestamp-count target-table)
                        checkpoint (get-checkpoint-value transform)]
                    (is (= 10 row-count) "First run should process the first 10 products")
                    (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")
                    (is (compare-checkpoint-values :temporal expected-initial-checkpoint checkpoint)
                        (format "Checkpoint should be MAX(%s) from first 10 rows" field-name))))

                (testing "Second run processes remaining data"
                  (transforms.execute/execute! transform {:run-method :manual})
                  (let [row-count (get-table-row-count target-table)
                        distinct-timestamps (get-distinct-timestamp-count target-table)
                        checkpoint (get-checkpoint-value transform)]
                    (is (= 16 row-count) "Second run should add remaining 6 rows")
                    (is (= 2 distinct-timestamps) "Should have 2 distinct timestamps (one per incremental run)")
                    (is (compare-checkpoint-values :temporal expected-second-checkpoint checkpoint)
                        (format "Checkpoint should be MAX(%s) from all 16 rows" field-name))))

                (testing "Third run without new data adds nothing"
                  (transforms.execute/execute! transform {:run-method :manual})
                  (let [row-count (get-table-row-count target-table)]
                    (is (= 16 row-count) "Should still have 16 rows, no new data")))

                (testing "After inserting new data, incremental run appends only new rows"
                  (with-insert-test-products!
                    [{:name "New Temporal Product"
                      :category "Electronics"
                      :price 299.99
                      :created-at "2024-01-21T10:00:00"}]

                    (transforms.execute/execute! transform {:run-method :manual})
                    (let [row-count (get-table-row-count target-table)
                          checkpoint (get-checkpoint-value transform)]
                      (is (= 17 row-count) "Should append 1 new row (16 + 1 = 17)")
                      (is (some? checkpoint) "Checkpoint should be updated"))))))))))))

(defn- pg-table-rows [db-spec table-name]
  (next.jdbc/execute! db-spec [(format "SELECT * FROM %s" table-name)] {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(deftest empty-table-test
  (mt/test-drivers #{:postgres}                             ; no db specifics
    (mt/with-premium-features #{:transforms}
      (with-transform-cleanup! [target-table "empty_table_target"]
        (let [db-id   (mt/id)
              db-spec (sql-jdbc.conn/db->pooled-connection-spec db-id)
              source  {:type                        "query"
                       :query                       {:database db-id
                                                     :type     :native
                                                     :native   {:query "SELECT * FROM (VALUES (42)) x(id) WHERE 1 = 2"}}
                       :source-incremental-strategy {:type "checkpoint", :checkpoint-filter "id"}}
              target  {:type                        "table-incremental"
                       :schema                      "public"
                       :name                        target-table
                       :database                    db-id
                       :target-incremental-strategy {:type "append"}}]
          (mt/with-temp [:model/Transform transform {:name "test transform" :source source, :target target}]
            (transforms.execute/execute! transform {:run-method :manual})
            (testing "still creates target table"
              (is (= 1 (count (next.jdbc/execute! db-spec ["SELECT true FROM information_schema.tables WHERE table_name = ?" target-table])))))
            (testing "sync has picked up table"
              (is (=? {:name target-table, :fields [{:name "id"}]} (-> (t2/select-one :model/Table :name target-table) (t2/hydrate :fields)))))
            (testing "checkpoint is recognized"
              (is (some? (transforms.u/next-checkpoint transform))))))))))

(deftest checkpoint-field-does-not-exist-test
  (mt/test-drivers #{:postgres}                             ; no db specifics
    (mt/with-premium-features #{:transforms}
      (with-transform-cleanup! [target-table "missing_field_target"]
        (let [db-id   (mt/id)
              db-spec (sql-jdbc.conn/db->pooled-connection-spec db-id)
              source  {:type                        "query"
                       :query                       {:database db-id
                                                     :type     :native
                                                     :native   {:query "SELECT * FROM (VALUES (42)) x(id)"}}
                       :source-incremental-strategy {:type "checkpoint", :checkpoint-filter "no_such_column"}}
              target  {:type                        "table-incremental"
                       :schema                      "public"
                       :name                        target-table
                       :database                    db-id
                       :target-incremental-strategy {:type "append"}}]
          (mt/with-temp [:model/Transform transform {:name "test transform" :source source, :target target}]
            (transforms.execute/execute! transform {:run-method :manual})
            (testing "still creates target table"
              (is (= 1 (count (next.jdbc/execute! db-spec ["SELECT true FROM information_schema.tables WHERE table_name = ?" target-table])))))
            (testing "sync has picked up table"
              (is (=? {:name target-table, :fields [{:name "id"}]} (-> (t2/select-one :model/Table :name target-table) (t2/hydrate :fields)))))
            (testing "target table has expected data"
              (is (= [{:id 42}] (pg-table-rows db-spec target-table))))
            (testing "checkpoint is not recognized, so transform acts as if no checkpoint"
              (is (nil? (transforms.u/next-checkpoint transform))))
            ;; Maybe this is unrealistic - you cannot select a column that does not exist
            ;; But the source tables schema can change, e.g. rename: you change event_time to event_ts or something
            ;; so one would have to be careful to disable or delete transforms ahead of a schema change like this
            ;; For now asserting behaviour is-what-it-is, but this should provoke a hmmm... maybe it is better to fail early?
            (testing "running a second time will duplicate the existing data"
              (transforms.execute/execute! transform {:run-method :manual})
              (is (= [{:id 42} {:id 42}] (pg-table-rows db-spec target-table))))))))))

(deftest changing-query-keeps-checkpoint-test
  (mt/test-drivers #{:postgres}                             ; no db specifics
    (mt/with-premium-features #{:transforms}
      (with-transform-cleanup! [target-table "change_table_target"]
        (let [db-id   (mt/id)
              db-spec (sql-jdbc.conn/db->pooled-connection-spec db-id)
              source  {:type                        "query"
                       :query                       {:database db-id
                                                     :type     :native
                                                     :native   {:query "SELECT * FROM (VALUES (42)) x(id)"}}
                       :source-incremental-strategy {:type "checkpoint", :checkpoint-filter "id"}}
              target  {:type                        "table-incremental"
                       :schema                      "public"
                       :name                        target-table
                       :database                    db-id
                       :target-incremental-strategy {:type "append"}}]
          (mt/with-temp [:model/Transform transform {:name "test transform" :source source, :target target}]
            (testing "initial run"
              (transforms.execute/execute! transform {:run-method :manual})
              (is (= [{:id 42}] (pg-table-rows db-spec target-table))))
            (testing "initial increment"
              (transforms.execute/execute! transform {:run-method :manual})
              (is (= [{:id 42}] (pg-table-rows db-spec target-table))))
            (t2/update! :model/Transform
                        (:id transform)
                        {:source {:type "query"
                                  :query {:database db-id
                                          :type     :native
                                          :native   {:query "SELECT * FROM (VALUES (42), (43)) x(id)"}}
                                  :source-incremental-strategy {:type "checkpoint", :checkpoint-filter "id"}}})
            (testing "second increment"
              (transforms.execute/execute! (t2/select-one :model/Transform (:id transform)) {:run-method :manual})
              (is (= [{:id 42} {:id 43}] (pg-table-rows db-spec target-table))))))))))

(deftest filter-column-indexed-test
  (testing "Filter column is indexed"
    (doseq [checkpoint-type [:integer]
            transform-type  [:native :mbql :python]
            :when (valid-checkpoint-transform-combo? checkpoint-type transform-type)]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (set/intersection (test-drivers) (mt/normal-drivers-with-feature :transforms/index-ddl))
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "incremental_index"]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      transform-payload (make-incremental-transform-payload "Incremental Transform" target-table transform-type checkpoint-config)
                      schema (:schema (:target transform-payload))]
                  (mt/with-temp [:model/Transform transform transform-payload]
                    (testing "First run creates index on checkpoint column"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (let [indexes    (driver/describe-table-indexes driver/*driver* (mt/id) {:schema schema, :name target-table})
                            field-name (:field-name checkpoint-config)]
                        (testing "Index was created"
                          (is (= 1 (count indexes)))
                          (is (=? {:value field-name :index-name #"^mb_transform_idx_.*$"} (first indexes))))))
                    (testing "Data was processed correctly"
                      (is (= 10 (get-table-row-count target-table))))
                    (testing "Second run succeeds with existing index"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (let [indexes    (driver/describe-table-indexes driver/*driver* (mt/id) {:schema schema, :name target-table})
                            field-name (:field-name checkpoint-config)]
                        (testing "Index still exists"
                          (is (= 1 (count indexes)))
                          (is (=? {:value field-name :index-name #"^mb_transform_idx_.*$"} (first indexes)))))
                      (testing "Data was processed correctly"
                        (is (= 16 (get-table-row-count target-table)))))))))))))))

(deftest index-cleanup-on-switch-to-non-incremental-test
  (testing "Switching to non-incremental removes metabase-owned indexes"
    (doseq [checkpoint-type [:integer]
            transform-type  [:native :mbql :python]
            :when (valid-checkpoint-transform-combo? checkpoint-type transform-type)]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (set/intersection (test-drivers) (mt/normal-drivers-with-feature :transforms/index-ddl))
          (mt/with-premium-features #{:transforms :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table "index_cleanup_non_incr"]
                (let [checkpoint-config   (get checkpoint-configs checkpoint-type)
                      {:keys [field-name]} checkpoint-config
                      incremental-payload (make-incremental-transform-payload "Index Cleanup Transform" target-table transform-type checkpoint-config)]
                  (mt/with-temp [:model/Transform transform incremental-payload]
                    (testing "First incremental run creates index"
                      (execute-transform-with-ordering! transform transform-type field-name {:run-method :manual})
                      (let [indexes (driver/describe-table-indexes driver/*driver* (mt/id) {:name target-table})]
                        (is (=? {:value field-name :index-name #"^mb_transform_idx_.*$"} (first indexes)))))
                    (testing "Switch to non-incremental via API"
                      (let [non-incremental-payload (-> incremental-payload
                                                        (update :source dissoc :source-incremental-strategy))
                            updated                 (mt/user-http-request :crowberto :put 200 (format "transform/%d" (:id transform))
                                                                          non-incremental-payload)]
                        (is (nil? (:source-incremental-strategy (:source updated))))))
                    (testing "Non-incremental run removes automatic indexes indexes"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (execute-transform-with-ordering! transform transform-type field-name {:run-method :manual})
                        (let [indexes    (driver/describe-table-indexes driver/*driver* (mt/id) {:name target-table})
                              mb-indexes (filter #(str/starts-with? (:index-name %) "mb_transform_idx_") indexes)]
                          (testing "Automatic indexes are dropped"
                            (is (empty? mb-indexes))))))))))))))))

(deftest index-cleanup-on-checkpoint-column-change-test
  (testing "Changing checkpoint column removes old index and creates new one"
    (mt/test-drivers (set/intersection (test-drivers) (mt/normal-drivers-with-feature :transforms/index-ddl))
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "icchange"]
            (let [integer-config  (get checkpoint-configs :integer)
                  float-config    (get checkpoint-configs :float)
                  initial-field   (:field-name integer-config)
                  new-field       (:field-name float-config)
                  transform-type  :native
                  initial-payload (make-incremental-transform-payload "Column Change Transform" target-table transform-type integer-config)]
              (mt/with-temp [:model/Transform transform initial-payload]
                (testing "First run with integer checkpoint creates index on id column"
                  (execute-transform-with-ordering! transform transform-type initial-field {:run-method :manual})
                  (let [indexes (driver/describe-table-indexes driver/*driver* (mt/id) {:name target-table})]
                    (is (= 1 (count indexes)))
                    (is (=? {:value initial-field :index-name #"^mb_transform_idx_.*$"} (first indexes)))))
                (testing "Switch checkpoint column via API"
                  (let [new-payload (make-incremental-transform-payload "Column Change Transform" target-table transform-type float-config)
                        updated     (mt/user-http-request :crowberto :put 200 (format "transform/%d" (:id transform))
                                                          new-payload)]
                    (is (= new-field (-> updated :source :source-incremental-strategy :checkpoint-filter)))))
                (testing "Run with new checkpoint column updates indexes"
                  (let [transform (t2/select-one :model/Transform (:id transform))]
                    (execute-transform-with-ordering! transform transform-type new-field {:run-method :manual})
                    (let [table              (t2/select-one :model/Table :name target-table)
                          indexes            (driver/describe-table-indexes driver/*driver* (mt/id) {:schema (:schema table) :name target-table})]
                      (testing "Old index removed, new checkpoint column is now indexed"
                        (is (= 1 (count indexes)))
                        (is (=? {:value new-field :index-name #"^mb_transform_idx_.*$"} (first indexes)))))))))))))))
