(ns metabase.driver-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.driver.impl :as driver.impl]
   [metabase.plugins.classloader :as classloader]
   [metabase.task.sync-databases :as task.sync-databases]
   [metabase.test :as mt]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(driver/register! ::test-driver, :abstract? true)

(defmethod driver/database-supports? [::test-driver :foreign-keys] [_driver _feature _db] true)
(defmethod driver/database-supports? [::test-driver :foreign-keys] [_driver _feature db] (= db "dummy"))

(deftest ^:parallel database-supports?-test
  (is (driver/database-supports? ::test-driver :foreign-keys "dummy"))
  (is (not (driver/database-supports? ::test-driver :foreign-keys "not-dummy")))
  (is (not (driver/database-supports? ::test-driver :expressions "dummy")))
  (is (thrown-with-msg?
        java.lang.Exception
        #"Invalid driver feature: .*"
        (driver/database-supports? ::test-driver :some-made-up-thing "dummy"))))

(deftest the-driver-test
  (testing (str "calling `the-driver` should set the context classloader, important because driver plugin code exists "
                "there but not elsewhere")
    (.setContextClassLoader (Thread/currentThread) (ClassLoader/getSystemClassLoader))
    (driver/the-driver :h2)
    (is (= @@#'classloader/shared-context-classloader
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
  (doseq [d (tx.env/test-drivers)]
    (testing (str d " has entirely unique connection property names")
      (let [props         (driver/connection-properties d)
            props-by-name (group-by :name props)]
        (is (= (count props) (count props-by-name))
            (format "Property(s) with duplicate name: %s" (-> (filter (fn [[_ props]]
                                                                        (> (count props) 1))
                                                                      props-by-name)
                                                              vec
                                                              pr-str)))))))

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

(deftest can-connect-with-destroy-db-test
  (testing "driver/can-connect? should fail or throw after destroying a database"
    (mt/test-drivers (->> (mt/normal-drivers)
                          ;; athena is a special case because connections aren't made with a single database,
                          ;; but to an S3 bucket that may contain many databases
                          (remove #{:athena}))
      (let [database-name (mt/random-name)
            dbdef         (basic-db-definition database-name)]
        (mt/dataset dbdef
          (let [db (mt/db)
                details (tx/dbdef->connection-details driver/*driver* :db dbdef)]
            (testing "can-connect? should return true before deleting the database"
              (is (true? (binding [h2/*allow-testing-h2-connections* true]
                           (driver/can-connect? driver/*driver* details)))))
            ;; release db resources like connection pools so we don't have to wait to finish syncing before destroying the db
            (driver/notify-database-updated driver/*driver* db)
            (testing "after deleting a database, can-connect? should return false or throw an exception"
              (let [;; in the case of some cloud databases, the test database is never created, and can't or shouldn't be destroyed.
                    ;; so fake it by changing the database details
                    details (case driver/*driver*
                              (:redshift :snowfake :vertica) (assoc details :db (mt/random-name))
                              :oracle                        (assoc details :service-name (mt/random-name))
                              :presto-jdbc                   (assoc details :catalog (mt/random-name))
                              ;; otherwise destroy the db and use the original details
                              (do
                                (tx/destroy-db! driver/*driver* dbdef)
                                details))]
                (is (false? (try
                              (binding [h2/*allow-testing-h2-connections* true]
                                (driver/can-connect? driver/*driver* details))
                              (catch Exception _
                                false))))))
            ;; clean up the database
            (t2/delete! :model/Database (u/the-id db))))))))

(deftest check-can-connect-before-sync-test
  (testing "Database sync should short-circuit and fail if the database at the connection has been deleted (metabase#7526)"
    (mt/test-drivers (->> (mt/normal-drivers)
                          ;; athena is a special case because connections aren't made with a single database,
                          ;; but to an S3 bucket that may contain many databases
                          (remove #{:athena}))
      (let [database-name (mt/random-name)
            dbdef         (basic-db-definition database-name)]
        (mt/dataset dbdef
          (let [db (mt/db)
                cant-sync-logged? (fn []
                                    (some?
                                     (some
                                      (fn [[log-level throwable message]]
                                        (and (= log-level :warn)
                                             (instance? clojure.lang.ExceptionInfo throwable)
                                             (re-matches #"^Cannot sync Database ([\s\S]+): ([\s\S]+)" message)))
                                      (mt/with-log-messages-for-level :warn
                                        (#'task.sync-databases/sync-and-analyze-database*! (u/the-id db))))))]
            (testing "sense checks before deleting the database"
              (testing "sense check 1: sync-and-analyze-database! should not log a warning"
                (is (false? (cant-sync-logged?))))
              (testing "sense check 2: triggering the sync via the POST /api/database/:id/sync_schema endpoint should succeed"
                (is (= {:status "ok"}
                       (mt/user-http-request :crowberto :post 200 (str "/database/" (u/the-id db) "/sync_schema"))))))
            ;; release db resources like connection pools so we don't have to wait to finish syncing before destroying the db
            (driver/notify-database-updated driver/*driver* db)
            ;; destroy the db
            (if (contains? #{:redshift :snowflake :vertica :presto-jdbc :oracle} driver/*driver*)
              ;; in the case of some cloud databases, the test database is never created, and can't or shouldn't be destroyed.
              ;; so fake it by changing the database details
              (let [details     (:details (mt/db))
                    new-details (case driver/*driver*
                                  (:redshift :snowflake :vertica) (assoc details :db (mt/random-name))
                                  :oracle                         (assoc details :service-name (mt/random-name))
                                  :presto-jdbc                    (assoc details :catalog (mt/random-name)))]
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

(deftest nonsql-dialects-return-original-query-test
  (mt/test-driver :mongo
    (testing "Passing a mongodb query through [[driver/prettify-native-form]] returns the original query (#31122)"
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

        (testing "Formatting a non-sql query returns the same query"
          (is (= query formatted-query)))

        ;; TODO(qnkhuat): do we really need to handle case where wrong driver is passed?
        (let [;; This is a mongodb query, but if you pass in the wrong driver it will attempt the format
              ;; This is a corner case since the system should always be using the right driver
              weird-formatted-query (driver/prettify-native-form :postgres (json/generate-string query))]
          (testing "The wrong formatter will change the format..."
            (is (not= query weird-formatted-query)))
          (testing "...but the resulting data is still the same"
            ;; Bottom line - Use the right driver, but if you use the wrong
            ;; one it should be harmless but annoying
            (is (= query
                   (json/parse-string weird-formatted-query)))))))))
