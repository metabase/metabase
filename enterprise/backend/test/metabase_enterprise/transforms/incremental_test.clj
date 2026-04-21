(ns ^:mb/driver-tests ^:mb/transforms-python-test metabase-enterprise.transforms.incremental-test
  "Tests for incremental transforms functionality."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [java-time.api :as t]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.sql.util :as sql.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.transforms.test-dataset :as transforms-dataset]
   [metabase.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [next.jdbc :as next.jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [toucan2.core :as t2]))

(def checkpoint-configs
  {:integer {:field-name "id"
             :template-tag-type :number
             :expected-initial-checkpoint 16
             :expected-second-checkpoint 17}
   :float {:field-name "price"
           :template-tag-type :number
           :expected-initial-checkpoint 199.99
           :expected-second-checkpoint 379.99}
   :temporal {:field-name "created_at"
              :template-tag-type :text
              :expected-initial-checkpoint #t "2024-01-16T10:00:00Z"
              :expected-second-checkpoint #t "2024-01-20T10:00:00Z"}})

(defn- valid-checkpoint-transform-combo?
  "Check if a checkpoint type and transform type combination is valid.
   With table tag expansion, all combinations are now supported."
  [_checkpoint-type _transform-type]
  true)

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

(defn- make-incremental-source-query-with-table-tag
  "Create a native query with a table tag for testing subquery expansion."
  [checkpoint-config]
  (let [{:keys [field-name]} checkpoint-config
        table-id (mt/id :transforms_products)
        timestamp-sql (first (sql/format (sql.qp/current-datetime-honeysql-form driver/*driver*)))
        query (format "SELECT *, %s AS %s FROM {{source_table}} AS %s ORDER BY %s"
                      timestamp-sql
                      (sql.u/quote-name driver/*driver* :field "load_timestamp")
                      (sql.u/quote-name driver/*driver* :field "source_table")
                      (sql.u/quote-name driver/*driver* :field field-name))]
    {:database (mt/id)
     :type :native
     :native {:query query
              :template-tags {"source_table" {:id "source_table"
                                              :name "source_table"
                                              :display-name "Source Table"
                                              :type "table"
                                              :table-id table-id
                                              :required true}}}}))

(defn- make-incremental-mbql-query
  "Create an MBQL query for incremental transforms. "
  [checkpoint-config]
  (let [{:keys [field-name]} checkpoint-config]
    (mt/mbql-query transforms_products {:expressions {"load_timestamp" [:now]}
                                        :order-by [[:asc [:field (mt/id :transforms_products (keyword field-name))]]]})))

(def incremental-python-body
  (str "import pandas as pd\n"
       "from datetime import datetime\n"
       "\n"
       "def transform(transforms_products):\n"
       "    transforms_products['load_timestamp'] = datetime.now()\n"
       "    return transforms_products"))

(defn- make-incremental-transform-payload
  "Create a transform payload for incremental transform testing.

  transform-type can be :native, :mbql, or :python
  checkpoint-config should be from checkpoint-configs"
  [transform-name target-table transform-type checkpoint-config]
  (let [{:keys [field-name]} checkpoint-config
        checkpoint-filter-field (fn [] (t2/select-one-pk :model/Field :name field-name :table_id (mt/id :transforms_products)))]
    {:name transform-name
     :source_database_id (mt/id)
     :source (case transform-type
               ;; Native queries now use table tags with checkpoint-filter-field-id
               :native {:type "query"
                        :query (make-incremental-source-query-with-table-tag checkpoint-config)
                        :source-incremental-strategy {:type "checkpoint"
                                                      :checkpoint-filter-field-id (checkpoint-filter-field)}}
               :mbql {:type "query"
                      :query (make-incremental-mbql-query checkpoint-config)
                      :source-incremental-strategy {:type "checkpoint"
                                                    :checkpoint-filter-field-id (checkpoint-filter-field)}}
               :python {:type "python"
                        :source-tables [(transforms.tu/source-table-entry "transforms_products" (mt/id :transforms_products))]
                        :body incremental-python-body
                        :source-incremental-strategy {:type "checkpoint"
                                                      :checkpoint-filter-field-id (checkpoint-filter-field)}})
     :target (merge target-table {:type                        "table-incremental"
                                  :target-incremental-strategy {:type "append"}})}))

(defn- get-table-row-count
  "Get the row count of a table by name."
  [{table-name :name}]
  (let [table          (t2/select-one :model/Table :name table-name)
        mp             (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (:id table))
        count-query    (lib/aggregate (lib/query mp table-metadata) (lib/count))
        result         (qp/process-query count-query)]
    (some-> result :data :rows first first bigint)))

(defn- get-distinct-timestamp-count
  "Get the count of distinct load_timestamp values in a table."
  [{table-name :name, :keys [schema database]}]
  (let [native-query {:database database
                      :type     :native
                      :native   {:query (format "SELECT COUNT(DISTINCT %s) FROM %s"
                                                (sql.u/quote-name driver/*driver* :field "load_timestamp")
                                                (sql.u/quote-name driver/*driver* :table schema table-name))}}
        result       (qp/process-query native-query)]
    (some-> result :data :rows first first bigint)))

(defn- get-checkpoint-value [transform-id]
  (let [transform (t2/select-one :model/Transform transform-id)
        {:keys [last_checkpoint_value]} transform]
    (when last_checkpoint_value
      (let [source-incremental-strategy (get-in transform [:source :source-incremental-strategy])
            field-id (:checkpoint-filter-field-id source-incremental-strategy)
            field (t2/select-one :model/Field field-id)]
        (#'transforms-base.u/parse-checkpoint-value (:base_type field) last_checkpoint_value)))))

(defn- compare-checkpoint-values
  "Compare two checkpoint values with type-appropriate logic. "
  [checkpoint-type expected actual]
  (case checkpoint-type
    :integer (= (bigint expected) (bigint actual))
    :float (and (number? actual)
                (< (Math/abs (double (- expected actual))) 0.01))
    :temporal (= (t/local-date-time expected) (t/local-date-time actual))))

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

(defn- target-table-gen [prefix]
  {:type     :table
   :name     prefix
   :schema   (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
   :database (mt/id)})

(deftest create-incremental-transform-test
  (testing "Creating an incremental transform with checkpoint strategy"
    (doseq [checkpoint-type [:integer :float]
            :let [transform-type :native]]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms-basic}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table (target-table-gen "incremental_test")]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [field-name]} checkpoint-config
                      expected-field-id (t2/select-one-pk :model/Field :name field-name :table_id (mt/id :transforms_products))
                      transform-payload (make-incremental-transform-payload "Test Incremental Transform" target-table :native checkpoint-config)]
                  (testing "Transform is created successfully"
                    (mt/with-temp [:model/Transform transform transform-payload]
                      (is (some? (:id transform)))
                      (is (= "Test Incremental Transform" (:name transform)))
                      (is (= "table-incremental" (-> transform :target :type)))
                      (is (= "checkpoint" (-> transform :source :source-incremental-strategy :type)))
                      (is (= expected-field-id (-> transform :source :source-incremental-strategy :checkpoint-filter-field-id)))

                      (testing "No checkpoint exists initially"
                        (is (nil? (get-checkpoint-value (:id transform)))))

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
          (mt/with-premium-features #{:transforms-basic :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table (target-table-gen "incremental_twice")]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [expected-initial-checkpoint expected-second-checkpoint]} checkpoint-config
                      transform-payload (make-incremental-transform-payload "Incremental Transform" target-table transform-type checkpoint-config)]
                  (mt/with-temp [:model/Transform transform transform-payload]
                    (testing "First run processes all data"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (transforms.tu/wait-for-table (:name target-table) 10000)
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 16 row-count) "First run should process all 16 products")
                        (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")

                        (testing "Checkpoint is created after first run"
                          (let [checkpoint (get-checkpoint-value (:id transform))]
                            (is (compare-checkpoint-values checkpoint-type expected-initial-checkpoint checkpoint)
                                (format "Checkpoint should be MAX(%s) from all 16 rows" (:field-name checkpoint-config)))))))

                    (testing "Second run with no new data adds nothing"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                        (let [row-count           (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)]
                          (is (= 16 row-count) "Should still have 16 rows, no new data")
                          (is (= 1 distinct-timestamps) "Should still have 1 distinct timestamp"))))

                    (when (and (isa? driver/hierarchy driver/*driver* :sql-jdbc)
                               (not= driver/*driver* :clickhouse)
                               (not= driver/*driver* :snowflake))
                      (testing "After inserting new data, incremental run appends only new rows"
                        (with-insert-test-products!
                          [{:name "Incremental Twice Product"
                            :category "Gadget"
                            :price 379.99
                            :created-at "2024-01-20T10:00:00"}]
                          (let [transform (t2/select-one :model/Transform (:id transform))]
                            (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                            (let [row-count           (get-table-row-count target-table)
                                  distinct-timestamps (get-distinct-timestamp-count target-table)
                                  checkpoint          (get-checkpoint-value (:id transform))]
                              (is (= 17 row-count) "Should append 1 new row (16 + 1 = 17)")
                              (is (= 2 distinct-timestamps) "Should have 2 distinct timestamps (one per incremental run)")
                              (if (= checkpoint-type :integer)
                                ;; Integer checkpoint uses auto-increment ID, just verify it advanced
                                (is (> checkpoint expected-initial-checkpoint)
                                    "Integer checkpoint should advance past initial value")
                                (is (compare-checkpoint-values checkpoint-type expected-second-checkpoint checkpoint)
                                    (format "Checkpoint should be MAX(%s) from all 17 rows" (:field-name checkpoint-config)))))))))))))))))))

(deftest switch-incremental-to-non-incremental-test
  (testing "Switching an incremental transform to non-incremental overwrites data"
    (doseq [checkpoint-type [:integer :float :temporal]
            transform-type [:native :mbql :python]
            :when (valid-checkpoint-transform-combo? checkpoint-type transform-type)]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms-basic :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table (target-table-gen "switch_incr_to_non_incr")]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [expected-initial-checkpoint]} checkpoint-config
                      initial-payload (make-incremental-transform-payload "Switch Transform" target-table transform-type checkpoint-config)]
                  (mt/with-temp [:model/Transform transform initial-payload]
                    (let [get-transform #(t2/select-one :model/Transform (:id transform))]
                      (testing "Initial incremental run processes all data"
                        (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                        (transforms.tu/wait-for-table (:name target-table) 10000)
                        (let [row-count           (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)
                              checkpoint          (get-checkpoint-value (:id transform))]
                          (is (= 16 row-count) "Initial run should process all 16 products")
                          (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")
                          (is (compare-checkpoint-values checkpoint-type expected-initial-checkpoint checkpoint) "Checkpoint should be created")))

                      (testing "Second incremental run with no new data"
                        (execute-transform-with-ordering! (get-transform) transform-type (:field-name checkpoint-config) {:run-method :manual})
                        (let [row-count           (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)]
                          (is (= 16 row-count) "Should still have 16 rows, no new data")
                          (is (= 1 distinct-timestamps) "Should still have 1 distinct timestamp")))

                      (testing "Switch to non-incremental via PUT API"
                        (let [non-incremental-payload (-> initial-payload
                                                          (update :source dissoc :source-incremental-strategy)
                                                          (update :target dissoc :source-incremental-strategy)
                                                          (update :target assoc :type "table"))
                              updated                 (mt/user-http-request :crowberto :put 200 (format "transform/%d" (:id transform))
                                                                            non-incremental-payload)]
                          (is (= "table" (-> updated :target :type)))
                          (is (nil? (-> updated :source :source-incremental-strategy)))))

                      (testing "Non-incremental run overwrites all data"
                        (let [transform (t2/select-one :model/Transform (:id transform))]
                          (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                          (let [row-count           (get-table-row-count target-table)
                                distinct-timestamps (get-distinct-timestamp-count target-table)]
                            (is (= 16 row-count) "Should overwrite to 16 rows")
                            (is (= 1 distinct-timestamps) "All rows should have same timestamp after non-incremental overwrite"))

                          (testing "Running again still overwrites"
                            (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                            (let [row-count           (get-table-row-count target-table)
                                  distinct-timestamps (get-distinct-timestamp-count target-table)]
                              (is (= 16 row-count) "Should still have 16 rows after another run")
                              (is (= 1 distinct-timestamps) "Should still have 1 distinct timestamp"))))))))))))))))

(deftest switch-non-incremental-to-incremental-test
  (testing "Switching a non-incremental transform to incremental computes checkpoint from existing data"
    (doseq [checkpoint-type [:integer :float :temporal]
            transform-type [:native :mbql :python]
            :when (valid-checkpoint-transform-combo? checkpoint-type transform-type)]
      (testing (format "with %s checkpoint on %s transform" (name checkpoint-type) (name transform-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms-basic :transforms-python}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table (target-table-gen "switch_non_incr_to_incr")]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [expected-initial-checkpoint]} checkpoint-config
                      incremental-payload (make-incremental-transform-payload "Switch Transform" target-table transform-type checkpoint-config)
                      initial-payload (-> incremental-payload
                                          (update :source dissoc :source-incremental-strategy)
                                          (update :target dissoc :source-incremental-strategy)
                                          (update :target assoc :type "table"))]
                  (mt/with-temp [:model/Transform transform initial-payload]
                    (testing "Initial non-incremental run creates table"
                      (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                      (transforms.tu/wait-for-table (:name target-table) 10000)
                      (let [row-count (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)]
                        (is (= 16 row-count) "Initial run should process all 16 products")
                        (is (= 1 distinct-timestamps) "All rows should have same timestamp from non-incremental run")
                        (testing "No checkpoint exists"
                          (let [checkpoint (get-checkpoint-value (:id transform))]
                            (is (nil? checkpoint) "No checkpoint for non-incremental transform")))))

                    (testing "Switch to incremental via PUT API"
                      (let [updated (mt/user-http-request :crowberto :put 200 (format "transform/%d" (:id transform))
                                                          incremental-payload)]
                        (is (= "table-incremental" (-> updated :target :type)))
                        (is (= "checkpoint" (-> updated :source :source-incremental-strategy :type)))))

                    (testing "First incremental run after switch recreates table with checkpoint"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                        (let [row-count           (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)
                              checkpoint          (get-checkpoint-value (:id transform))]
                          (is (= 16 row-count) "Should have all 16 rows")
                          (is (= 1 distinct-timestamps) "Should have 1 distinct timestamp")
                          (is (compare-checkpoint-values checkpoint-type expected-initial-checkpoint checkpoint) "Checkpoint should be computed from existing data"))))

                    (testing "Second incremental run with no new data"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (execute-transform-with-ordering! transform transform-type (:field-name checkpoint-config) {:run-method :manual})
                        (let [row-count           (get-table-row-count target-table)
                              distinct-timestamps (get-distinct-timestamp-count target-table)]
                          (is (= 16 row-count) "Should still have 16 rows, no new data")
                          (is (= 1 distinct-timestamps) "Should still have 1 distinct timestamp"))))

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
                                  checkpoint (get-checkpoint-value (:id transform))]
                              (is (= 17 row-count) "Should append 1 new row (16 + 1 = 17)")
                              ;; For integer checkpoints, we can verify exact value >= 17
                              ;; For float/temporal, just verify checkpoint exists
                              (is (some? checkpoint) "Checkpoint should be updated"))))))))))))))))

(deftest unsupported-checkpoint-column-type-test
  (testing "Transform fails at runtime with unsupported checkpoint column type"
    (mt/test-drivers #{:postgres}
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "unsupported_type_test"]
            (let [name-field-id (mt/id :transforms_products :name)
                  table-id (mt/id :transforms_products)
                  schema (t2/select-one-fn :schema :model/Table table-id)
                  transform-payload {:name "Invalid Checkpoint Type Transform"
                                     :source {:type "query"
                                              :query {:database (mt/id)
                                                      :type :native
                                                      :native {:query "SELECT * FROM {{source_table}} AS s"
                                                               :template-tags {"source_table" {:id "source_table"
                                                                                               :name "source_table"
                                                                                               :display-name "Source Table"
                                                                                               :type "table"
                                                                                               :table-id table-id
                                                                                               :required true}}}}
                                              :source-incremental-strategy {:type "checkpoint"
                                                                            :checkpoint-filter-field-id name-field-id}}
                                     :target {:type "table-incremental"
                                              :schema schema
                                              :name target-table
                                              :database (mt/id)
                                              :target-incremental-strategy {:type "append"}}}]
              (testing "API validation rejects unsupported checkpoint column type"
                (let [response (mt/user-http-request :crowberto :post 400 "transform" transform-payload)]
                  (is (string? response))
                  (is (re-find #"unsupported type" response)))))))))))

(defn- pg-table-rows [db-spec table-name]
  (next.jdbc/execute! db-spec [(format "SELECT * FROM %s" table-name)] {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(deftest empty-table-test
  (mt/test-drivers #{:postgres}
    (mt/with-premium-features #{:transforms-basic}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [target-table "empty_table_target"]
          (let [db-id   (mt/id)
                db-spec (sql-jdbc.conn/db->pooled-connection-spec db-id)
                table-id (mt/id :transforms_products)
                checkpoint-field-id (t2/select-one-pk :model/Field :name "id" :table_id table-id)
                ;; Query that returns no rows but has the checkpoint column
                source  {:type                        "query"
                         :query                       {:database db-id
                                                       :type     :native
                                                       :native   {:query "SELECT * FROM {{source_table}} AS s WHERE 1 = 2"
                                                                  :template-tags {"source_table" {:id "source_table"
                                                                                                  :name "source_table"
                                                                                                  :display-name "Source Table"
                                                                                                  :type "table"
                                                                                                  :table-id table-id
                                                                                                  :required true}}}}
                         :source-incremental-strategy {:type "checkpoint"
                                                       :checkpoint-filter-field-id checkpoint-field-id}}
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
                (is (=? {:name target-table} (t2/select-one :model/Table :name target-table))))
              (testing "checkpoint is set from source table MAX even though query returned no rows"
                (let [transform (t2/select-one :model/Transform (:id transform))]
                  (is (some? (:last_checkpoint_value transform))
                      "Checkpoint is computed from source table, not query output"))))))))))

(deftest checkpoint-field-does-not-exist-test
  (testing "Transform with non-existent checkpoint-filter-field-id fails gracefully"
    (mt/test-drivers #{:postgres}
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "missing_field_target"]
            (let [db-id   (mt/id)
                  table-id (mt/id :transforms_products)
                  invalid-field-id 999999
                  source  {:type                        "query"
                           :query                       {:database db-id
                                                         :type     :native
                                                         :native   {:query "SELECT id FROM {{source_table}}"
                                                                    :template-tags {"source_table" {:id "source_table"
                                                                                                    :name "source_table"
                                                                                                    :display-name "Source Table"
                                                                                                    :type "table"
                                                                                                    :table-id table-id
                                                                                                    :required true}}}}
                           :source-incremental-strategy {:type "checkpoint"
                                                         :checkpoint-filter-field-id invalid-field-id}}
                  target  {:type                        "table-incremental"
                           :schema                      "public"
                           :name                        target-table
                           :database                    db-id
                           :target-incremental-strategy {:type "append"}}]
              (mt/with-temp [:model/Transform transform {:name "test transform" :source source, :target target}]
                (testing "Transform execution fails with invalid checkpoint field ID"
                  (is (thrown-with-msg?
                       Exception
                       #"Checkpoint field does not exist"
                       (transforms.execute/execute! transform {:run-method :manual}))))))))))))

(deftest checkpoint-field-is-not-active-test
  (testing "Transform with inactive checkpoint field fails gracefully"
    (mt/test-drivers #{:postgres}
      (mt/with-premium-features #{:transforms-basic}
        (mt/dataset transforms-dataset/transforms-test
          (with-transform-cleanup! [target-table "inactive_field_target"]
            (let [db-id   (mt/id)
                  table-id (mt/id :transforms_products)
                  field-id (mt/id :transforms_products :id)
                  source  {:type                        "query"
                           :query                       {:database db-id
                                                         :type     :native
                                                         :native   {:query "SELECT id FROM {{source_table}} as s"
                                                                    :template-tags {"source_table" {:id "source_table"
                                                                                                    :name "source_table"
                                                                                                    :display-name "Source Table"
                                                                                                    :type "table"
                                                                                                    :table-id table-id
                                                                                                    :required true}}}}
                           :source-incremental-strategy {:type "checkpoint"
                                                         :checkpoint-filter-field-id field-id}}
                  target  {:type                        "table-incremental"
                           :schema                      "public"
                           :name                        target-table
                           :database                    db-id
                           :target-incremental-strategy {:type "append"}}]
              (mt/with-temp [:model/Transform transform {:name "test transform" :source source, :target target}]
                ;; Mark the field as inactive
                (t2/update! :model/Field field-id {:active false})
                (try
                  (testing "Transform execution fails with inactive checkpoint field"
                    (is (thrown-with-msg?
                         Exception
                         #"Checkpoint field does not exist or is not active"
                         (transforms.execute/execute! transform {:run-method :manual}))))
                  (finally
                    ;; Restore field to active state for other tests
                    (t2/update! :model/Field field-id {:active true})))))))))))

(deftest changing-query-keeps-checkpoint-test
  (mt/test-drivers #{:postgres}
    (mt/with-premium-features #{:transforms-basic}
      (mt/dataset transforms-dataset/transforms-test
        (with-transform-cleanup! [target-table "change_table_target"]
          (let [db-id   (mt/id)
                db-spec (sql-jdbc.conn/db->pooled-connection-spec db-id)
                table-id (mt/id :transforms_products)
                checkpoint-field-id (t2/select-one-pk :model/Field :name "id" :table_id table-id)
                make-source (fn [query-sql]
                              {:type "query"
                               :query {:database db-id
                                       :type :native
                                       :native {:query query-sql
                                                :template-tags {"source_table" {:id "source_table"
                                                                                :name "source_table"
                                                                                :display-name "Source Table"
                                                                                :type "table"
                                                                                :table-id table-id
                                                                                :required true}}}}
                               :source-incremental-strategy {:type "checkpoint"
                                                             :checkpoint-filter-field-id checkpoint-field-id}})
                source  (make-source "SELECT id FROM {{source_table}} AS s")
                target  {:type                        "table-incremental"
                         :schema                      "public"
                         :name                        target-table
                         :database                    db-id
                         :target-incremental-strategy {:type "append"}}]
            (mt/with-temp [:model/Transform transform {:name "test transform" :source source, :target target}]
              (testing "initial run processes all rows"
                (transforms.execute/execute! transform {:run-method :manual})
                (is (= 16 (count (pg-table-rows db-spec target-table)))))
              (testing "second run with no new data"
                (transforms.execute/execute! transform {:run-method :manual})
                (is (= 16 (count (pg-table-rows db-spec target-table)))))
              (t2/update! :model/Transform
                          (:id transform)
                          {:source (make-source "SELECT id FROM {{source_table}} AS s ORDER BY id DESC")})
              (testing "run after query change with no new data keeps same row count"
                (transforms.execute/execute! (t2/select-one :model/Transform (:id transform)) {:run-method :manual})
                (is (= 16 (count (pg-table-rows db-spec target-table)))
                    "Checkpoint preserved across query change, no new rows added"))
              (testing "after inserting new data, incremental run appends"
                (with-insert-test-products!
                  [{:name "New Product" :category "Test" :price 99.99 :created-at "2024-01-21T10:00:00"}]
                  (let [transform (t2/select-one :model/Transform (:id transform))]
                    (transforms.execute/execute! transform {:run-method :manual})
                    (is (= 17 (count (pg-table-rows db-spec target-table)))
                        "Should append 1 new row after query change")))))))))))

(deftest native-query-with-table-tag-test
  (testing "Native query with table tag uses subquery expansion for incremental filtering"
    (doseq [checkpoint-type [:integer :float]]
      (testing (format "with %s checkpoint" (name checkpoint-type))
        (mt/test-drivers (test-drivers)
          (mt/with-premium-features #{:transforms-basic}
            (mt/dataset transforms-dataset/transforms-test
              (with-transform-cleanup! [target-table (target-table-gen "native_table_tag")]
                (let [checkpoint-config (get checkpoint-configs checkpoint-type)
                      {:keys [field-name expected-initial-checkpoint]} checkpoint-config
                      checkpoint-filter-field-id (t2/select-one-pk :model/Field :name field-name :table_id (mt/id :transforms_products))
                      transform-payload {:name "Native With Table Tag"
                                         :source {:type "query"
                                                  :query (make-incremental-source-query-with-table-tag checkpoint-config)
                                                  :source-incremental-strategy {:type "checkpoint"
                                                                                :checkpoint-filter-field-id checkpoint-filter-field-id}}
                                         :target (merge target-table
                                                        {:type                        "table-incremental"
                                                         :target-incremental-strategy {:type "append"}})}]
                  (mt/with-temp [:model/Transform transform transform-payload]
                    (testing "First run processes all data"
                      (transforms.execute/execute! transform {:run-method :manual})
                      (transforms.tu/wait-for-table (:name target-table) 10000)
                      (let [row-count           (get-table-row-count target-table)
                            distinct-timestamps (get-distinct-timestamp-count target-table)
                            checkpoint          (get-checkpoint-value (:id transform))]
                        (is (= 16 row-count) "First run should process all 16 products")
                        (is (= 1 distinct-timestamps) "All rows should have the same timestamp from first run")
                        (is (compare-checkpoint-values checkpoint-type expected-initial-checkpoint checkpoint)
                            (format "Checkpoint should be MAX(%s) from all 16 rows" field-name))))

                    (testing "Second run without new data adds nothing"
                      (let [transform (t2/select-one :model/Transform (:id transform))]
                        (transforms.execute/execute! transform {:run-method :manual})
                        (let [row-count (get-table-row-count target-table)]
                          (is (= 16 row-count) "Should still have 16 rows, no new data"))))

                    (when (and (isa? driver/hierarchy driver/*driver* :sql-jdbc)
                               (not= driver/*driver* :clickhouse)
                               (not= driver/*driver* :snowflake))
                      (testing "After inserting new data, incremental run appends only new rows"
                        (with-insert-test-products!
                          [{:name "New Table Tag Product"
                            :category "Electronics"
                            :price 299.99
                            :created-at "2024-01-21T10:00:00"}]

                          (let [transform (t2/select-one :model/Transform (:id transform))]
                            (transforms.execute/execute! transform {:run-method :manual})
                            (let [row-count  (get-table-row-count target-table)
                                  checkpoint (get-checkpoint-value (:id transform))]
                              (is (= 17 row-count) "Should append 1 new row (16 + 1 = 17)")
                              (is (some? checkpoint) "Checkpoint should be updated"))))))))))))))))
