(ns ^:mb/driver-tests metabase-enterprise.transforms.execute-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.query-test-util :as query-test-util]
   [metabase-enterprise.transforms.test-dataset :as transforms-dataset]
   [metabase-enterprise.transforms.test-util :as transforms.tu :refer [with-transform-cleanup!]]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.sql :as sql.tx]
   [toucan2.core :as t2]
   [toucan2.util :as u]))

(set! *warn-on-reflection* true)

(defn- make-query
  "Create a query using the shared test utility.
   Maintains the same signature for compatibility with existing tests."
  ([source-table]
   (query-test-util/make-query {:source-table source-table}))
  ([source-table source-column constraint-fn & constraint-params]
   (query-test-util/make-query
    {:source-table  source-table
     :source-column source-column
     :filter-fn     constraint-fn
     :filter-values constraint-params})))

(defn- wait-for-table
  [table-name timeout-ms]
  (let [mp    (mt/metadata-provider)
        limit (+ (System/currentTimeMillis) timeout-ms)]
    (loop []
      (Thread/sleep 200)
      (when (> (System/currentTimeMillis) limit)
        (throw (ex-info "table has not been created" {:table-name table-name, :timeout-ms timeout-ms})))
      (or (m/find-first (comp #{table-name} :name) (lib.metadata/tables mp))
          (recur)))))

(deftest execute-test
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
    (mt/dataset transforms-dataset/transforms-test
      (let [target-type "table"
            schema      (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
        (with-transform-cleanup! [{table1-name :name :as target1} {:type   target-type
                                                                   :schema schema
                                                                   :name   "g_products"}
                                  {table2-name :name :as target2} {:type   target-type
                                                                   :schema schema
                                                                   :name   "gizmo_products"}]
          (let [table-name (t2/select-one-fn :name :model/Table (mt/id :transforms_products))
                t1-query (make-query table-name "category" lib/starts-with "G")]
            (mt/with-temp [:model/Transform t1 {:name   "transform1"
                                                :source {:type  :query
                                                         :query t1-query}
                                                :target target1}]
              (transforms.execute/run-mbql-transform! t1 {:run-method :manual})
              (let [table1   (wait-for-table table1-name 10000)
                    t2-query (make-query table1 "category" lib/= "Gizmo")]
                (mt/with-temp [:model/Transform t2 {:name   "transform2"
                                                    :source {:type  :query
                                                             :query t2-query}
                                                    :target target2}]
                  (transforms.execute/run-mbql-transform! t2 {:run-method :cron})
                  (let [table2      (wait-for-table table2-name 10000)
                        check-query (lib/aggregate (make-query table2) (lib/count))
                        query-result (qp/process-query check-query)]
                    ;; The transforms-test dataset has exactly 4 Gizmo products (IDs 6, 8, 12, 14)
                    ;; First transform filters for categories starting with "G" (Gadget and Gizmo)
                    ;; Second transform filters for category = "Gizmo", resulting in 4 products
                    (is (= [[4]]
                           (mt/formatted-rows [int] query-result)))
                    (is (= [{:name "count"}]
                           (map #(select-keys % [:name])
                                (mt/cols query-result))))))))))))))

(deftest execute-test-aggregation-query
  (mt/test-drivers (mt/normal-driver-select {:+features [:transforms/table :left-join]})
    (mt/dataset transforms-dataset/transforms-test
      (let [target-type "table"
            schema      (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
        (with-transform-cleanup! [no-limit-table {:type   target-type
                                                  :schema schema
                                                  :name   "widgets_daily_no_limit"}
                                  limit-table {:type   target-type
                                               :schema schema
                                               :name   "widgets_daily_limit"}]
          (let [mp (mt/metadata-provider)
                transforms-products (lib.metadata/table mp (mt/id :transforms_products))
                transforms-orders (lib.metadata/table mp (mt/id :transforms_orders))
                products-id (lib.metadata/field mp (mt/id :transforms_products :id))
                orders-product-id (lib.metadata/field mp (mt/id :transforms_orders :product_id))
                products-category (lib.metadata/field mp (mt/id :transforms_products :category))
                orders-total (lib.metadata/field mp (mt/id :transforms_orders :total))
                orders-order-date (lib.metadata/field mp (mt/id :transforms_orders :order_date))
                query-no-limit (-> (lib/query mp transforms-products)
                                   (lib/join (lib/join-clause transforms-orders
                                                              [(lib/= products-id orders-product-id)]))
                                   (lib/filter (lib/= products-category "Widget"))
                                   (lib/filter (lib/not-null orders-total))
                                   (lib/aggregate (lib/sum orders-total))
                                   (lib/breakout (lib/with-temporal-bucket
                                                   orders-order-date :day))
                                   (as-> <> (lib/order-by <> (lib/aggregation-ref <> 0) :desc)))]
            (mt/with-temp [:model/Transform transform-no-limit {:name   "transform"
                                                                :source {:type  :query
                                                                         :query query-no-limit}
                                                                :target no-limit-table}
                           :model/Transform transform-limit {:name   "transform"
                                                             :source {:type  :query
                                                                      :query (lib/limit query-no-limit 5)}
                                                             :target limit-table}]
              (doseq [transform [transform-no-limit transform-limit]]
                (transforms.execute/run-mbql-transform! transform {:run-method :manual})
                (let [table-name (-> transform :target :name)
                      table-result (wait-for-table table-name 10000)
                      query-result (->> (lib/query mp table-result)
                                        (qp/process-query)
                                        (mt/formatted-rows [str 2.0])
                                        (sort-by second >)
                                        vec)]
                  (is (= [["2024-01-24T00:00:00Z" 104.97]
                          ["2024-01-22T00:00:00Z" 49.98]
                          ["2024-01-15T00:00:00Z" 39.98]
                          ["2024-01-21T00:00:00Z" 19.99]
                          ["2024-01-23T00:00:00Z" 14.99]]
                         query-result)))))))))))

(deftest create-table-from-schema!-test
  (mt/test-drivers (mt/normal-drivers-with-feature :uploads)
    (let [driver       driver/*driver*
          db-id        (mt/id)
          table-name   (mt/random-name)
          schema-name  (sql.tx/session-schema driver)
          table-schema {:name    (if schema-name
                                   (keyword schema-name table-name)
                                   (keyword table-name))
                        :columns [{:name "id" :type :type/Integer :nullable? false}
                                  {:name "name" :type :type/Text :nullable? true}]}]
      (mt/as-admin
        (testing "create-table-from-schema! should create the table successfully"
          (transforms.util/create-table-from-schema! driver db-id table-schema)
          (let [table-exists? (driver/table-exists? driver db-id {:schema schema-name :name table-name})]
            (is (some? table-exists?) "Table should exist in the database schema")
            (driver/drop-table! driver db-id (:name table-schema))))))))

(deftest transform-schema-created-if-needed-test
  (mt/test-drivers (mt/normal-driver-select {:+features [:transforms/table :schemas]})
    (mt/dataset transforms-dataset/transforms-test
      (with-transform-cleanup! [target-table {:type   "table"
                                              :schema (str "transform_schema_" (mt/random-name))
                                              :name   "widget_products"}]
        (let [mp (mt/metadata-provider)
              transforms-products (lib.metadata/table mp (mt/id :transforms_products))
              products-category (lib.metadata/field mp (mt/id :transforms_products :category))
              products-id (lib.metadata/field mp (mt/id :transforms_products :id))
              query (-> (lib/query mp transforms-products)
                        (lib/filter (lib/= products-category "Widget"))
                        (lib/order-by products-id :asc))]
          (mt/with-temp [:model/Transform transform {:name   "transform"
                                                     :source {:type  :query
                                                              :query query}
                                                     :target target-table}]
            (transforms.execute/run-mbql-transform! transform {:run-method :manual})
            (let [table-result      (wait-for-table (:name target-table) 10000)
                  query-result (->> (lib/query mp table-result)
                                    (qp/process-query)
                                    (mt/formatted-rows [int str str 2.0 str])
                                    (sort-by first <))]
              (is (= [[1 "Widget A" "Widget" 19.99 "2024-01-01T10:00:00Z"]
                      [7 "Widget B" "Widget" 24.99 "2024-01-07T10:00:00Z"]
                      [9 "Widget C" "Widget" 14.99 "2024-01-09T10:00:00Z"]
                      [10 "Widget D" "Widget" 34.99 "2024-01-10T10:00:00Z"]
                      [15 "Widget E" "Widget" 44.99 "2024-01-15T10:00:00Z"]]
                     query-result)))))))))

;; TODO(rileythomp, 2025-08-28): Make this test driver agnostic
(deftest no-create-schema-permissions-test
  (mt/test-driver :postgres
    (mt/dataset transforms-dataset/transforms-test
      (let [details (:details (mt/db))
            password (:password details)
            no-schema-user (u/lower-case-en (mt/random-name))
            spec (sql-jdbc.conn/db->pooled-connection-spec (mt/id))]
        (try
          (driver/execute-raw-queries! driver/*driver* spec
                                       [[(format "CREATE ROLE %s WITH LOGIN PASSWORD '%s';" no-schema-user password)]
                                        [(format "REVOKE CREATE ON DATABASE \"%s\" FROM %s;" (:db details) no-schema-user)]
                                        [(format "GRANT USAGE ON SCHEMA public TO %s;" no-schema-user)]
                                        [(format "GRANT SELECT ON ALL TABLES IN SCHEMA public TO %s;" no-schema-user)]
                                        [(format "GRANT CREATE ON SCHEMA public TO %s;" no-schema-user)]])
          (mt/with-temp [:model/Database db {:engine :postgres
                                             :details (assoc details
                                                             :user no-schema-user)}]
            (mt/with-db db
              (sync/sync-database! db {:scan :schema})
              (let [mp (mt/metadata-provider)
                    transforms-products (lib.metadata/table mp (mt/id :transforms_products))
                    products-category (lib.metadata/field mp (mt/id :transforms_products :category))
                    products-id (lib.metadata/field mp (mt/id :transforms_products :id))
                    query (-> (lib/query mp transforms-products)
                              (lib/filter (lib/= products-category "Widget"))
                              (lib/order-by products-id :asc))]
                (testing "user without create schema permissions should be able to create tables in existing schema"
                  (with-transform-cleanup! [target-table {:type   "table"
                                                          :schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))
                                                          :name   "widget_products"}]
                    (mt/with-temp [:model/Transform transform {:name   "transform"
                                                               :source {:type  :query
                                                                        :query query}
                                                               :target target-table}]
                      (transforms.execute/run-mbql-transform! transform {:run-method :manual})
                      (let [table-result      (wait-for-table (:name target-table) 10000)
                            query-result (->> (lib/query mp table-result)
                                              (qp/process-query)
                                              (mt/formatted-rows [int str str 2.0 str])
                                              (sort-by first <))]
                        (is (= [[1 "Widget A" "Widget" 19.99 "2024-01-01T10:00:00Z"]
                                [7 "Widget B" "Widget" 24.99 "2024-01-07T10:00:00Z"]
                                [9 "Widget C" "Widget" 14.99 "2024-01-09T10:00:00Z"]
                                [10 "Widget D" "Widget" 34.99 "2024-01-10T10:00:00Z"]
                                [15 "Widget E" "Widget" 44.99 "2024-01-15T10:00:00Z"]]
                               query-result))))))
                (testing "user without create schema permissions should not be able to create a new schema"
                  (with-transform-cleanup! [target-table {:type   "table"
                                                          :schema (str "transform_schema_" (mt/random-name))
                                                          :name   "widget_products"}]
                    (mt/with-temp [:model/Transform transform {:name   "transform"
                                                               :source {:type  :query
                                                                        :query query}
                                                               :target target-table}]

                      (is (thrown-with-msg?
                           clojure.lang.ExceptionInfo
                           #"ERROR: permission denied for database transforms-test"
                           (transforms.execute/run-mbql-transform! transform {:run-method :manual})))))))))
          (finally
            (driver/execute-raw-queries! driver/*driver* spec
                                         [[(format "DROP OWNED BY %s;" no-schema-user)]
                                          [(format "DROP ROLE IF EXISTS %s;" no-schema-user)]])))))))

(deftest atomic-python-transform-swap-test
  (testing "Python transform execution with atomic table swap"
    (mt/test-drivers #{:h2 :postgres}
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                     :schema schema
                                                                     :name   "atomic_python_swap"}]
              (let [initial-transform {:name   "Python Transform Initial"
                                       :source {:type  "python"
                                                :source-tables {}
                                                :body  (str "import pandas as pd\n"
                                                            "\n"
                                                            "def transform():\n"
                                                            "    return pd.DataFrame({'name': ['Alice', 'Bob'], 'age': [25, 30]})")}
                                       :target (assoc target :database (mt/id))}]
                (mt/with-temp [:model/Transform transform initial-transform]
                  (transforms.execute/execute-python-transform! transform {:run-method :manual})
                  (wait-for-table table-name 10000)

                  (let [initial-rows (transforms.tu/table-rows table-name)]
                    (is (= [["Alice" 25] ["Bob" 30]] initial-rows) "Initial data should be Alice and Bob")

                    (t2/update! :model/Transform (:id transform)
                                {:source {:type "python"
                                          :source-tables {}
                                          :body (str "import pandas as pd\n"
                                                     "\n"
                                                     "def transform():\n"
                                                     "    return pd.DataFrame({'name': ['Charlie', 'Diana', 'Eve'], 'age': [35, 40, 45]})")}}))

                  (let [swap-latch (java.util.concurrent.CountDownLatch. 1)
                        original-rename-tables-atomic! transforms.util/rename-tables!]
                    (with-redefs [transforms.util/rename-tables! (fn [driver db-id rename-pairs]
                                                                   (.await swap-latch)
                                                                   (original-rename-tables-atomic! driver db-id rename-pairs))]
                      (let [transform-future (future
                                               (transforms.execute/execute-python-transform!
                                                (t2/select-one :model/Transform (:id transform))
                                                {:run-method :manual}))]
                        (is (= [["Alice" 25] ["Bob" 30]]
                               (transforms.tu/table-rows table-name))
                            "Original data should still be accessible during transform")
                        (.countDown swap-latch)
                        @transform-future
                        (is (= [["Charlie" 35] ["Diana" 40] ["Eve" 45]]
                               (transforms.tu/table-rows table-name))
                            "Table should now contain Charlie, Diana, and Eve")))))))))))))

(deftest python-transform-temp-table-cleanup-test
  (testing "Python transform cleans up temp tables on success"
    (mt/test-drivers #{:h2 :postgres}
      (mt/with-premium-features #{:transforms}
        (mt/dataset transforms-dataset/transforms-test
          (let [schema (t2/select-one-fn :schema :model/Table (mt/id :transforms_products))]
            (with-transform-cleanup! [{table-name :name :as target} {:type   "table"
                                                                     :schema schema
                                                                     :name   "python_cleanup_test"}]
              (let [transform-def {:name   "Python Transform Cleanup"
                                   :source {:type  "python"
                                            :source-tables {}
                                            :body  (str "import pandas as pd\n"
                                                        "\n"
                                                        "def transform():\n"
                                                        "    return pd.DataFrame({'col1': [1, 2, 3], 'col2': ['a', 'b', 'c']})")}
                                   :target (assoc target :database (mt/id))}]
                (mt/with-temp [:model/Transform transform transform-def]
                  (transforms.execute/execute-python-transform! transform {:run-method :manual})
                  (wait-for-table table-name 10000)

                  (transforms.execute/execute-python-transform! transform {:run-method :manual})

                  (let [db-id (mt/id)
                        tables (t2/select :model/Table :db_id db-id :active true)
                        new-table-pattern (re-pattern (str ".*" table-name "_" transforms.execute/temp-table-suffix-new "_.*"))
                        old-table-pattern (re-pattern (str ".*" table-name "_" transforms.execute/temp-table-suffix-old "_.*"))]
                    (is (not-any? #(or (re-matches new-table-pattern (:name %))
                                       (re-matches old-table-pattern (:name %))) tables)
                        (str "No temp tables (_" transforms.execute/temp-table-suffix-new "_ or _" transforms.execute/temp-table-suffix-old "_) should remain after successful Python transform"))

                    (is (= [[1 "a"] [2 "b"] [3 "c"]] (transforms.tu/table-rows table-name))
                        "Table should contain the expected data after swap")))))))))))
