(ns ^:mb/driver-tests metabase.driver-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.driver :as driver]
   [metabase.driver.ddl.interface :as ddl.i]
   [metabase.driver.impl :as driver.impl]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.sync.task.sync-databases :as task.sync-databases]
   [metabase.test :as mt]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(driver/register! ::test-driver, :abstract? true)

(defmethod driver/database-supports? [::test-driver :metadata/key-constraints] [_driver _feature db] (= db "dummy"))

(deftest ^:parallel database-supports?-test
  (is (driver/database-supports? ::test-driver :metadata/key-constraints "dummy"))
  (is (not (driver/database-supports? ::test-driver :metadata/key-constraints "not-dummy")))
  (is (not (driver/database-supports? ::test-driver :expressions "dummy")))
  (is (thrown-with-msg?
       java.lang.Exception
       #"Invalid driver feature: .*"
       (driver/database-supports? ::test-driver :some-made-up-thing "dummy"))))

(deftest the-driver-test
  (testing (str "calling `the-driver` should set the context classloader if the driver is not registered yet,"
                "important because driver plugin code exists there but not elsewhere")
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (with-redefs [driver.impl/hierarchy (make-hierarchy)] ;; To simulate :h2 not being registed yet.
      (driver/the-driver :h2))
    (is (= @classloader/shared-context-classloader
           (.getContextClassLoader (Thread/currentThread))))))

(deftest available?-test
  (with-redefs [driver.impl/concrete? (constantly true)]
    (is (driver/available? ::test-driver))
    (is (driver/available? "metabase.driver-test/test-driver")
        "`driver/available?` should work for if `driver` is a string -- see #10135")))

(deftest ^:parallel unique-connection-property-test
  ;; abnormal usage here; we are not using the regular mt/test-driver or mt/test-drivers, because those involve
  ;; initializing the driver and test data namespaces, which don't necessarily exist for all drivers (ex:
  ;; googleanalytics), and besides which, we don't actually need sample data or test extensions for this test itself

  ;; so instead, just iterate through all drivers currently set to test by the environment, and check their
  ;; connection-properties; between all the different CI driver runs, this should cover everything
  (letfn [(count-named-props [props]
            ;; Recursively count all properties with :name, including within groups
            (reduce (fn [acc prop]
                      (cond
                        (= :group (:type prop))
                        (+ acc (count-named-props (:fields prop)))

                        (:name prop)
                        (inc acc)

                        :else
                        acc))
                    0
                    props))]
    (doseq [d (tx.env/test-drivers)]
      (testing (str d " has entirely unique connection property names")
        (let [props           (driver/connection-properties d)
              props-by-name   (driver.u/collect-all-props-by-name props)
              total-props     (count-named-props props)]
          ;; If there are duplicate names, some will be overwritten in the map,
          ;; so the map size will be less than the total count of named properties
          (is (= total-props (count props-by-name))
              (format "Property(s) with duplicate name: %d total properties but only %d unique names in %s"
                      total-props (count props-by-name) d)))))))

(deftest supports-schemas-matches-describe-database-test
  (mt/test-drivers (mt/normal-drivers)
    (if (driver/database-supports? driver/*driver* :schemas (mt/db))
      (testing "`describe-database` should return schemas with tables if the database supports schemas"
        (is (some? (->> (driver/describe-database driver/*driver* (mt/db))
                        :tables
                        (some :schema)))))
      (testing "`describe-database` should not return schemas with tables if the database doesn't support schemas"
        (is (nil? (->> (driver/describe-database driver/*driver* (mt/db))
                       :tables
                       (some :schema))))))))

(defn- basic-db-definition [database-name]
  (tx/map->DatabaseDefinition
   {:database-name     database-name
    :table-definitions [{:table-name        "baz"
                         :field-definitions [{:field-name "foo", :base-type :type/Text}]
                         :rows              [["bar"]]}]}))

(doseq [driver [:redshift :snowflake :vertica :presto-jdbc :oracle]]
  (defmethod driver/database-supports? [driver :test/cannot-destroy-db]
    [_driver _feature _database]
    true))

(deftest can-connect-with-destroy-db-test
  (testing "driver/can-connect? should fail or throw after destroying a database"
    (mt/test-drivers (set/difference (mt/normal-drivers-with-feature :test/dynamic-dataset-loading)
                                     (mt/normal-drivers-with-feature :test/creates-db-on-connect))
      (let [database-name (mt/random-name)
            dbdef         (basic-db-definition database-name)]
        (mt/dataset dbdef
          (let [db (mt/db)
                details (tx/dbdef->connection-details driver/*driver* :db dbdef)]
            (testing "can-connect? should return true before deleting the database"
              (is (true? (binding [driver.settings/*allow-testing-h2-connections* true]
                           (driver/can-connect? driver/*driver* details)))))
            ;; release db resources like connection pools so we don't have to wait to finish syncing before destroying the db
            (driver/notify-database-updated driver/*driver* db)
            (testing "after deleting a database, can-connect? should return false or throw an exception"
              (let [;; in the case of some cloud databases, the test database is never created, and can't or shouldn't be destroyed.
                    ;; so fake it by changing the database details
                    details (if (driver/database-supports? driver/*driver* :test/cannot-destroy-db (mt/db))
                              (merge details (tx/bad-connection-details driver/*driver*))
                              ;; otherwise destroy the db and use the original details
                              (do
                                (tx/destroy-db! driver/*driver* dbdef)
                                details))]
                (is (false? (try
                              (binding [driver.settings/*allow-testing-h2-connections* true]
                                (driver/can-connect? driver/*driver* details))
                              (catch Exception _
                                false))))))
            ;; clean up the database
            (t2/delete! :model/Database (u/the-id db))))))))

(deftest check-can-connect-before-sync-test
  (testing "Database sync should short-circuit and fail if the database at the connection has been deleted (metabase#7526)"
    (mt/test-drivers (set/difference (mt/normal-drivers-with-feature :test/dynamic-dataset-loading)
                                     (mt/normal-drivers-with-feature :test/creates-db-on-connect))
      (let [database-name (mt/random-name)
            dbdef         (basic-db-definition database-name)]
        (mt/dataset dbdef
          (let [db (mt/db)
                cant-sync-logged? (fn []
                                    (mt/with-log-messages-for-level [messages :warn]
                                      (#'task.sync-databases/sync-and-analyze-database*! (u/the-id db))
                                      (some?
                                       (some
                                        (fn [{:keys [level e message]}]
                                          (and (= level :warn)
                                               (instance? clojure.lang.ExceptionInfo e)
                                               (re-matches #"^Cannot sync Database ([\s\S]+): ([\s\S]+)" message)))
                                        (messages)))))]
            (testing "sense checks before deleting the database"
              (testing "sense check 1: sync-and-analyze-database! should not log a warning"
                (is (false? (cant-sync-logged?))))
              (testing "sense check 2: triggering the sync via the POST /api/database/:id/sync_schema endpoint should succeed"
                (is (= {:status "ok"}
                       (mt/user-http-request :crowberto :post 200 (str "/database/" (u/the-id db) "/sync_schema"))))))
            ;; release db resources like connection pools so we don't have to wait to finish syncing before destroying the db
            (driver/notify-database-updated driver/*driver* db)
            ;; destroy the db
            (if (driver/database-supports? driver/*driver* :test/cannot-destroy-db (mt/db))
              ;; in the case of some cloud databases, the test database is never created, and can't or shouldn't be destroyed.
              ;; so fake it by changing the database details
              (let [details     (:details (mt/db))
                    new-details (merge details (tx/bad-connection-details driver/*driver*))]
                (t2/update! :model/Database (u/the-id db) {:details new-details}))
              ;; otherwise destroy the db and use the original details
              (tx/destroy-db! driver/*driver* dbdef))
            (testing "after deleting a database, sync should fail"
              (testing "1: sync-and-analyze-database! should log a warning and fail early"
                (is (true? (cant-sync-logged?))))
              (testing "2: triggering the sync via the POST /api/database/:id/sync_schema endpoint should fail"
                (mt/user-http-request :crowberto :post 422 (str "/database/" (u/the-id db) "/sync_schema"))))
            ;; clean up the database
            (t2/delete! :model/Database (u/the-id db))))))))

(deftest supports-table-privileges-matches-implementations-test
  (mt/test-drivers (mt/normal-drivers-with-feature :table-privileges)
    (is (some? (driver/current-user-table-privileges driver/*driver* (mt/db))))))

(deftest ^:parallel mongo-prettify-native-form-test
  (mt/test-driver :mongo
    (let [query [{"$group"   {"_id" {"created_at" {"$let" {"vars" {"parts" {"$dateToParts" {"timezone" "UTC"
                                                                                            "date"     "$created_at"}}}
                                                           "in"   {"$dateFromParts" {"timezone" "UTC"
                                                                                     "year"     "$$parts.year"
                                                                                     "month"    "$$parts.month"
                                                                                     "day"      "$$parts.day"}}}}}
                              "sum" {"$sum" "$tax"}}}
                 {"$sort"    {"_id" 1}}
                 {"$project" {"_id"        false
                              "created_at" "$_id.created_at"
                              "sum"        true}}]
          formatted-query (driver/prettify-native-form :mongo query)]

      (testing "Formatting a mongo query returns a JSON-like string"
        (is (= (str/join "\n"
                         ["["
                          "  {"
                          "    \"$group\": {"
                          "      \"_id\": {"
                          "        \"created_at\": {"
                          "          \"$let\": {"
                          "            \"vars\": {"
                          "              \"parts\": {"
                          "                \"$dateToParts\": {"
                          "                  \"timezone\": \"UTC\","
                          "                  \"date\": \"$created_at\""
                          "                }"
                          "              }"
                          "            },"
                          "            \"in\": {"
                          "              \"$dateFromParts\": {"
                          "                \"timezone\": \"UTC\","
                          "                \"year\": \"$$parts.year\","
                          "                \"month\": \"$$parts.month\","
                          "                \"day\": \"$$parts.day\""
                          "              }"
                          "            }"
                          "          }"
                          "        }"
                          "      },"
                          "      \"sum\": {"
                          "        \"$sum\": \"$tax\""
                          "      }"
                          "    }"
                          "  },"
                          "  {"
                          "    \"$sort\": {"
                          "      \"_id\": 1"
                          "    }"
                          "  },"
                          "  {"
                          "    \"$project\": {"
                          "      \"_id\": false,"
                          "      \"created_at\": \"$_id.created_at\","
                          "      \"sum\": true"
                          "    }"
                          "  }"
                          "]"])
               formatted-query)))

      (testing "The formatted JSON-like string is equivalent to the query"
        (is (= query (json/decode formatted-query))))

        ;; TODO(qnkhuat): do we really need to handle case where wrong driver is passed?
      (let [;; This is a mongodb query, but if you pass in the wrong driver it will attempt the format
              ;; This is a corner case since the system should always be using the right driver
            weird-formatted-query (driver/prettify-native-form :postgres (json/encode query))]
        (testing "The wrong formatter will change the format..."
          (is (not= query weird-formatted-query)))
        (testing "...but the resulting data is still the same"
            ;; Bottom line - Use the right driver, but if you use the wrong
            ;; one it should be harmless but annoying
          (is (= query
                 (json/decode weird-formatted-query))))))))

(deftest ^:parallel prettify-native-form-executable-test
  (mt/test-drivers
    (set (filter (partial get-method driver/prettify-native-form) (mt/normal-drivers)))
    (is (=? {:status :completed}
            (qp/process-query {:database (mt/id)
                               :type     :native
                               :native   (-> (qp.compile/compile (mt/mbql-query orders {:limit 1}))
                                             (update :query (partial driver/prettify-native-form driver/*driver*)))})))))

(deftest ^:parallel table-exists-test
  (testing "Make sure checking for table existence works"
    (mt/test-drivers (mt/normal-drivers-with-feature :metadata/table-existence-check)
      (let [venues-table (t2/select-one :model/Table :id (mt/id :venues))
            fake-table {:name "fake_table_xyz123" :schema (:schema venues-table)}]
        (is (driver/table-exists? driver/*driver* (mt/db) venues-table)
            (str "Driver " driver/*driver* " should detect that venues table exists"))
        (is (not (driver/table-exists? driver/*driver* (mt/db) fake-table))
            (str "Driver " driver/*driver* " should detect that fake table doesn't exist"))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;; Begin tests for `describe-*` methods used in sync
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- describe-fields-for-table [db table]
  (sort-by :database-position
           (if (driver/database-supports? driver/*driver* :describe-fields db)
             (mapv #(dissoc % :table-name :table-schema)
                   (driver/describe-fields driver/*driver* db
                                           :schema-names [(:schema table)]
                                           :table-names [(:name table)]))
             (:fields (driver/describe-table driver/*driver* db table)))))

(deftest ^:parallel describe-fields-or-table-test
  (testing "test `describe-fields` or `describe-table` returns some basic metadata"
    (mt/test-drivers (mt/normal-drivers)
      (mt/dataset daily-bird-counts
        (let [table (t2/select-one :model/Table :id (mt/id :bird-count))
              fmt   #(ddl.i/format-name driver/*driver* %)]
          (is (=? [{:name              (fmt "id")
                    :database-type     string?
                    :database-position 0
                    :base-type         #(isa? % :type/Number)}
                   {:name              (fmt "date")
                    :database-type     string?
                    :database-position 1
                    :base-type         #(isa? % :type/Temporal)}
                   {:name              (fmt "count")
                    :database-type     string?
                    :database-position 2
                    :base-type         #(isa? % :type/Number)}]
                  (describe-fields-for-table (mt/db) table))))))))

(deftest ^:parallel describe-fields-returns-nullability-test
  (mt/test-drivers (mt/normal-drivers-with-feature :test/dynamic-dataset-loading :test/create-table-without-data)
    (mt/dataset nullable-db
      (let [table   (t2/select-one :model/Table :id (mt/id :nullable))
            fields  (describe-fields-for-table (mt/db) table)
            [a b c] (->> ["a" "b" "c"]
                         (map #(ddl.i/format-name driver/*driver* %))
                         (map (u/index-by :name fields)))]
        ;; this test only properties of the field-meta returned by the driver, not whether it syncs, for that see sync_metadata/fields_test.clj
        (if (driver/database-supports? driver/*driver* :describe-is-nullable (mt/db))
          (testing ":database-is-nullable should be provided"
            (is (= [false true false] (mapv :database-is-nullable [a b c]))))
          (testing ":database-is-nullable should remain unspecified"
            (is (= [nil nil nil] (mapv :database-is-nullable [a b c])))))))))

(deftest ^:parallel describe-fields-returns-default-expr-test
  (mt/test-drivers (mt/normal-drivers-with-feature :test/dynamic-dataset-loading :test/create-table-without-data)
    (mt/dataset default-expr-db
      (let [table (t2/select-one :model/Table :id (mt/id :default_expr))
            fields (describe-fields-for-table (mt/db) table)
            [a b c] (->> ["a" "b" "c"]
                         (map #(ddl.i/format-name driver/*driver* %))
                         (map (u/index-by :name fields)))]
        ;; this test only properties of the field-meta returned by the driver, not whether it syncs, for that see sync_metadata/fields_test.clj
        (if (driver/database-supports? driver/*driver* :describe-default-expr (mt/db))
          (testing ":database-default should be provided"
            ;; SQL Server likes to add some parens
            (is (=? [nil #"\(*42\)*" nil] (mapv :database-default [a b c]))))
          (testing ":database-default should remain unspecified"
            (is (= [nil nil nil] (mapv :database-default [a b c])))))))))

(deftest ^:parallel describe-fields-returns-is-generated-test
  (mt/test-drivers (mt/normal-drivers-with-feature :test/dynamic-dataset-loading :test/create-table-without-data)
    (mt/dataset generated-column-db
      (let [table (t2/select-one :model/Table :id (mt/id :generated_column))
            fields (describe-fields-for-table (mt/db) table)
            [a b c] (->> ["a" "b" "c"]
                         (map #(ddl.i/format-name driver/*driver* %))
                         (map (u/index-by :name fields)))]
        ;; this test only properties of the field-meta returned by the driver, not whether it syncs, for that see sync_metadata/fields_test.clj
        (if (driver/database-supports? driver/*driver* :describe-is-generated (mt/db))
          (testing ":database-is-generated should be provided"
            (is (= [false true false] (mapv :database-is-generated [a b c]))))
          (testing ":database-is-generated should remain unspecified"
            (is (= [nil nil nil] (mapv :database-is-generated [a b c])))))))))

(deftest ^:parallel describe-table-fks-test
  (testing "`describe-table-fks` should work for drivers that do not support `describe-fks`"
    (mt/test-drivers (set/difference (mt/normal-drivers-with-feature :metadata/key-constraints)
                                     (mt/normal-drivers-with-feature :describe-fks))
      (let [orders   (t2/select-one :model/Table (mt/id :orders))
            products (t2/select-one :model/Table (mt/id :products))
            people   (t2/select-one :model/Table (mt/id :people))
            fmt      (partial ddl.i/format-name driver/*driver*)]
        (is (= #{{:fk-column-name   (fmt "user_id")
                  :dest-table       (select-keys people [:name :schema])
                  :dest-column-name (fmt "id")}
                 {:fk-column-name   (fmt "product_id")
                  :dest-table       (select-keys products [:name :schema])
                  :dest-column-name (fmt "id")}}
               #_{:clj-kondo/ignore [:deprecated-var]}
               (driver/describe-table-fks driver/*driver* (mt/db) orders)))))))

(deftest ^:parallel describe-fks-test
  (testing "`describe-fks` works for drivers that support `describe-fks`"
    (mt/test-drivers (mt/normal-drivers-with-feature :metadata/key-constraints :describe-fks)
      (let [fmt           (partial ddl.i/format-name driver/*driver*)
            orders        (t2/select-one :model/Table (mt/id :orders))
            products      (t2/select-one :model/Table (mt/id :products))
            people        (t2/select-one :model/Table (mt/id :people))
            entire-db-fks (driver/describe-fks driver/*driver* (mt/db))
            schema-db-fks (driver/describe-fks driver/*driver* (mt/db)
                                               :schema-names (when (:schema orders) [(:schema orders)]))
            table-db-fks  (driver/describe-fks driver/*driver* (mt/db)
                                               :schema-names (when (:schema orders) [(:schema orders)])
                                               :table-names [(:name orders)])]
        (doseq [[description orders-fks]
                {"describe-fks results for entire DB includes the orders table FKs"
                 (into #{}
                       (filter (fn [x]
                                 (and (= (:fk-table-name x) (:name orders))
                                      (= (:fk-table-schema x) (:schema orders)))))
                       entire-db-fks)
                 "describe-fks results for a schema includes the orders table FKs"
                 (into #{}
                       (filter (fn [x]
                                 (and (= (:fk-table-name x) (:name orders))
                                      (= (:fk-table-schema x) (:schema orders)))))
                       schema-db-fks)
                 "describe-fks results for a table includes the orders table FKs"
                 (into #{} table-db-fks)}]
          (testing description
            (is (= #{{:fk-column-name  (fmt "user_id")
                      :fk-table-name   (:name orders)
                      :fk-table-schema (:schema orders)
                      :pk-column-name  (fmt "id")
                      :pk-table-name   (:name people)
                      :pk-table-schema (:schema people)}
                     {:fk-column-name  (fmt "product_id")
                      :fk-table-name   (:name orders)
                      :fk-table-schema (:schema orders)
                      :pk-column-name  (fmt "id")
                      :pk-table-name   (:name products)
                      :pk-table-schema (:schema products)}}
                   orders-fks))))))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;; End tests for `describe-*` methods used in sync
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; TODO: Uncomment when https://github.com/metabase/metabase/pull/60263 is merged
#_(deftest data-editing-requires-describe-features-test
    (testing "Drivers supporting :actions/data-editing must support relevant describe-X features"
      (mt/test-drivers (mt/normal-drivers-with-feature :actions/data-editing)
        (testing "describe-default-expr feature"
          (is (driver/database-supports? driver/*driver* :describe-default-expr (mt/db))
              (str driver/*driver* " must support :describe-default-expr to support :actions/data-editing")))
        (testing "describe-is-generated feature"
          (is (driver/database-supports? driver/*driver* :describe-is-generated (mt/db))
              (str driver/*driver* " must support :describe-is-generated to support :actions/data-editing")))
        (testing "describe-is-nullable feature"
          (is (driver/database-supports? driver/*driver* :describe-is-nullable (mt/db))
              (str driver/*driver* " must support :describe-is-nullable to support :actions/data-editing"))))))

(deftest query-driver-success-metrics-test
  (mt/test-drivers (mt/normal-drivers)
    (testing "the number of successful and failed queries should be tracked correctly"
      (let [success-query (assoc-in (mt/mbql-query venues) [:middleware :userland-query?] true)
            failure-query (assoc-in (mt/native-query {:query "bad query"})
                                    [:middleware :userland-query?] true)]
        (mt/with-prometheus-system! [_ system]
          (qp/process-query success-query)
          (try
            (qp/process-query failure-query)
            (catch Exception _))
          (qp/process-query success-query)
          (try
            (qp/process-query failure-query)
            (catch Exception _))
          (qp/process-query success-query)
          (is (= 3.0 (mt/metric-value system :metabase-query-processor/query {:driver driver/*driver* :status "success"})))
          (is (= 2.0 (mt/metric-value system :metabase-query-processor/query {:driver driver/*driver* :status "failure"}))))))))

(deftest python-transform-drivers-multimethods-support
  (mt/test-drivers (mt/normal-drivers-with-feature :transforms/python)
    (let [driver driver/*driver*]
      (is (get-method driver/create-table! driver))
      (is (get-method driver/table-name-length-limit driver))
      (is (get-method driver/drop-table! driver))
      (is (let [should-be-supported-by-all #{:type/Number :type/Text :type/Date :type/DateTime :type/DateTimeWithTZ :type/Boolean}]
            (and (get-method driver/type->database-type driver)
                 (every? #(driver/type->database-type driver %) should-be-supported-by-all))))
      (is (get-method driver/insert-from-source! [driver :jsonl-file])))))

(driver/register! ::mock-no-deps-driver, :abstract? true)

(deftest deps-ignores-invalid-drivers-test
  (is (= #{}
         (driver/native-query-deps ::mock-no-deps-driver nil nil))))

(driver/register! ::mock-deps-driver, :abstract? true)

(defmethod driver/database-supports? [::mock-deps-driver :dependencies/native]
  [_driver _feature _database]
  true)

(deftest deps-flags-when-supported-driver-is-not-covered-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Database that supports :dependencies/native does not provide an implementation of driver/native-query-deps"
                        (driver/native-query-deps ::mock-deps-driver nil nil))))

(deftest ^:parallel maybe-swap-details-test
  (testing "maybe-swap-details merges swap map into details"
    (driver/with-swapped-connection-details 1 {:user "swap-user" :password "swap-pass"}
      (is (= {:host "localhost" :user "swap-user" :password "swap-pass"}
             (driver/maybe-swap-details 1 {:host "localhost" :user "original-user" :password "original-pass"})))))

  (testing "maybe-swap-details returns details unchanged when no swap exists"
    (driver/with-swapped-connection-details 1 {:user "swap-user"}
      (is (= {:host "localhost" :user "original-user"}
             (driver/maybe-swap-details 2 {:host "localhost" :user "original-user"})))))

  (testing "maybe-swap-details supports deep merge for nested maps"
    (driver/with-swapped-connection-details 1 {:ssl {:key-store-password "new-pass"}}
      (is (= {:host "localhost" :ssl {:enabled true :key-store-password "new-pass"}}
             (driver/maybe-swap-details 1 {:host "localhost" :ssl {:enabled true :key-store-password "old-pass"}})))))

  (testing "deep merge adds new keys to nested maps"
    (driver/with-swapped-connection-details 1 {:ssl {:new-key "new-value"}}
      (is (= {:host "localhost" :ssl {:enabled true :new-key "new-value"}}
             (driver/maybe-swap-details 1 {:host "localhost" :ssl {:enabled true}})))))

  (testing "deep merge replaces nested map with non-map value"
    (driver/with-swapped-connection-details 1 {:ssl "disabled"}
      (is (= {:host "localhost" :ssl "disabled"}
             (driver/maybe-swap-details 1 {:host "localhost" :ssl {:enabled true :key-store "path"}})))))

  (testing "deep merge adds nested map where none existed"
    (driver/with-swapped-connection-details 1 {:ssl {:enabled true}}
      (is (= {:host "localhost" :ssl {:enabled true}}
             (driver/maybe-swap-details 1 {:host "localhost"})))))

  (testing "deep merge works with multiple levels of nesting"
    (driver/with-swapped-connection-details 1 {:advanced {:ssl {:cert {:path "/new/path"}}}}
      (is (= {:host "localhost" :advanced {:timeout 30 :ssl {:enabled true :cert {:path "/new/path"}}}}
             (driver/maybe-swap-details 1 {:host "localhost" :advanced {:timeout 30 :ssl {:enabled true :cert {:path "/old/path"}}}})))))

  (testing "nested swaps for the same database throw an exception"
    (driver/with-swapped-connection-details 1 {:user "outer"}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Nested connection detail swaps are not supported"
           (driver/with-swapped-connection-details 1 {:user "inner"}
             nil))))))
