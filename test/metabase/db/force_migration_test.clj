(ns metabase.db.force-migration-test
  (:require
   [clojure.test :refer :all]
   [metabase.db :as mdb]
   [metabase.db.custom-migrations :as custom-migrations]
   [metabase.db.liquibase :as liquibase]
   [metabase.db.setup :as db.setup]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (liquibase.lockservice LockServiceFactory)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(custom-migrations/define-migration FailCustomMigration
  (do
    (t2/insert! :ancient_civilization
                {:name   "Greek"
                 :period "1500BC"})
    (throw (ex-info "Intentionally throw an error" {}))))

(custom-migrations/define-migration SuccessCustomMigration
  (t2/insert! :ancient_civilization
              {:name "Egypt"
               :period "3100BC"}))

;; This test tests 4 things:
;; - It forces release the locks if there is one
;; - When running migrations, when a migration fails, ignores it and move on to the next migration
;; - All custom migrations are executed in a transaction, if it fails, nothing should be commited
;; - All migrations are executed in the order it's defined
(deftest force-migration-test
  (mt/test-drivers #{:h2 :mysql :postgres}
    (mt/with-temp-empty-app-db [conn driver/*driver*]
      (with-redefs [liquibase/changelog-file "force-migration.yaml"]
        (let [data-source  (mdb/data-source)
              database     (->> (if (instance? java.sql.Connection conn)
                                  conn
                                  (.getConnection ^javax.sql.DataSource conn))
                                (#'liquibase/liquibase-connection)
                                (#'liquibase/database))
              lock-service (.getLockService (LockServiceFactory/getInstance) database)]
          (.acquireLock lock-service)
          (db.setup/migrate! data-source :force)

          (testing "Make sure the migrations that intended to succeed are succeed"
            (is (= ["1" "2" "5"]
                   (t2/select-pks-vec (@#'liquibase/changelog-table-name conn) {:order-by [:dateexecuted :id]}))))

          (testing "the custom migration that fails doesn't commit its operation"
            (is (nil? (t2/select-one :ancient_civilization :name "Greek"))))

          (testing "the custom migration that success will persists it result successfully"
            (is (some? (t2/select-one :ancient_civilization :name "Egypt")))))))))
