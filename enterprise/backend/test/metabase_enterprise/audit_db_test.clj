(ns metabase-enterprise.audit-db-test
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.audit-db :as audit-db]
   [metabase.core :as mbc]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions :as perms]
   [metabase.task :as task]
   [metabase.task.sync-databases :as task.sync-databases]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :plugins))

(defmacro with-audit-db-restoration [& body]
  "Calls `ensure-audit-db-installed!` before and after `body` to ensure that the audit DB is installed and then
  restored if necessary. Also disables audit content loading if it is already loaded."
  `(let [audit-collection-exists?# (t2/exists? :model/Collection :type "instance-analytics")]
     (mt/with-temp-env-var-value [mb-load-analytics-content (not audit-collection-exists?#)]
       (mbc/ensure-audit-db-installed!)
       (try
         ~@body
         (finally
           (mbc/ensure-audit-db-installed!))))))

(deftest audit-db-installation-test
  (mt/test-drivers #{:postgres :h2 :mysql}
    (testing "Audit DB content is not installed when it is not found"
      (t2/delete! :model/Database :is_audit true)
      (with-redefs [audit-db/analytics-dir-resource nil]
        (is (= nil audit-db/analytics-dir-resource))
        (is (= ::audit-db/installed (audit-db/ensure-audit-db-installed!)))
        (is (= perms/audit-db-id (t2/select-one-fn :id 'Database {:where [:= :is_audit true]}))
            "Audit DB is installed.")
        (is (= 0 (t2/count :model/Card {:where [:= :database_id perms/audit-db-id]}))
            "No cards created for Audit DB."))
      (t2/delete! :model/Database :is_audit true))

    (testing "Audit DB content is installed when it is found"
      (is (= ::audit-db/installed (audit-db/ensure-audit-db-installed!)))
      (is (= perms/audit-db-id (t2/select-one-fn :id 'Database {:where [:= :is_audit true]}))
          "Audit DB is installed.")
      (is (some? (io/resource "instance_analytics")))
      (is (not= 0 (t2/count :model/Card {:where [:= :database_id perms/audit-db-id]}))
          "Cards should be created for Audit DB when the content is there."))

    (testing "Audit DB does not have scheduled syncs"
      (let [db-has-sync-job-trigger? (fn [db-id]
                                       (contains?
                                        (set (map #(-> % :data (get "db-id"))
                                                  (task/job-info "metabase.task.sync-and-analyze.job")))
                                        db-id))]
        (is (not (db-has-sync-job-trigger? perms/audit-db-id)))))

    (testing "Audit DB doesn't get re-installed unless the engine changes"
      (with-redefs [audit-db/load-analytics-content (constantly nil)]
        (is (= ::audit-db/no-op (audit-db/ensure-audit-db-installed!)))
        (t2/update! Database :is_audit true {:engine "datomic"})
        (is (= ::audit-db/updated (audit-db/ensure-audit-db-installed!)))
        (is (= ::audit-db/no-op (audit-db/ensure-audit-db-installed!)))
        (t2/update! Database :is_audit true {:engine "h2"})))))

(deftest audit-db-instance-analytics-content-is-copied-properly
  (fs/delete-tree "plugins/instance_analytics")
  (is (not (contains? (set (map str (fs/list-dir "plugins")))
                      "plugins/instance_analytics")))

  (#'audit-db/ia-content->plugins)
  (is (= #{"plugins/instance_analytics/collections"
           "plugins/instance_analytics/databases"}
         (set (map str (fs/list-dir "plugins/instance_analytics"))))))

(defn- get-audit-db-trigger-keys []
  (let [trigger-keys (->> (task/scheduler-info) :jobs (mapcat :triggers) (map :key))
        audit-db? #(str/includes? % (str perms/audit-db-id))]
    (filter audit-db? trigger-keys)))

(deftest no-sync-tasks-for-audit-db
  (with-audit-db-restoration
    (audit-db/ensure-audit-db-installed!)
    (is (= 0 (count (get-audit-db-trigger-keys))) "no sync scheduled after installation")

    (with-redefs [task.sync-databases/job-context->database-id (constantly perms/audit-db-id)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Cannot sync Database: It is the audit db."
           (#'task.sync-databases/sync-and-analyze-database! "job-context"))))
    (is (= 0 (count (get-audit-db-trigger-keys))) "no sync occured even when called directly for audit db.")))
