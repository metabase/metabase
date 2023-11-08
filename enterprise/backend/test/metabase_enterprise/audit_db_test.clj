(ns metabase-enterprise.audit-db-test
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is]]
   [metabase-enterprise.audit-db :as audit-db]
   [metabase.core :as mbc]
   [metabase.models.database :refer [Database]]
   [metabase.models.permissions :as perms]
   [metabase.task :as task]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro with-audit-db-restoration [& body]
  `(let [original-audit-db# (t2/select-one Database :is_audit true)]
     (try
       (t2/delete! Database :is_audit true)
       ~@body
       (finally
         (t2/delete! Database :is_audit true)
         (when original-audit-db#
           (#'mbc/ensure-audit-db-installed!))))))

(deftest audit-db-is-installed-then-left-alone
  (mt/test-drivers #{:postgres :h2 :mysql}
    (with-audit-db-restoration
      (t2/delete! Database :is_audit true)
      (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-db-installed!)))
      (is (= :metabase-enterprise.audit-db/no-op (audit-db/ensure-db-installed!)))

      (t2/update! Database :is_audit true {:engine "datomic"})
      (is (= :metabase-enterprise.audit-db/updated (audit-db/ensure-db-installed!)))
      (is (= :metabase-enterprise.audit-db/no-op (audit-db/ensure-db-installed!))))))

(deftest audit-db-content-is-not-installed-when-not-found
  (mt/test-drivers #{:postgres :h2 :mysql}
    (with-audit-db-restoration
      (with-redefs [audit-db/analytics-dir-resource nil]
        (is (= nil audit-db/analytics-dir-resource))
        (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-audit-db-installed!)))
        (is (= perms/audit-db-id (t2/select-one-fn :id 'Database {:where [:= :is_audit true]}))
            "Audit DB is installed.")
        (is (= 0 (t2/count :model/Card {:where [:= :database_id perms/audit-db-id]}))
            "No cards created for Audit DB.")))))

(deftest audit-db-content-is-installed-when-found
  (mt/test-drivers #{:postgres :h2 :mysql}
    (with-audit-db-restoration
      (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-audit-db-installed!)))
      (is (= perms/audit-db-id (t2/select-one-fn :id 'Database {:where [:= :is_audit true]}))
          "Audit DB is installed.")
      (is (some? (io/resource "instance_analytics")))
      (is (not= 0 (t2/count :model/Card {:where [:= :database_id perms/audit-db-id]}))
          "Cards should be created for Audit DB when the content is there."))))

(deftest audit-db-does-not-have-scheduled-syncs
  (mt/test-drivers #{:postgres :h2 :mysql}
    (with-audit-db-restoration
      (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-audit-db-installed!)))
      (let [db-has-sync-job-trigger? (fn [db-id]
                                       (contains?
                                        (set (map #(-> % :data (get "db-id"))
                                                  (task/job-info "metabase.task.sync-and-analyze.job")))
                                        db-id))]
        (is (not (db-has-sync-job-trigger? perms/audit-db-id)))))))

(deftest audit-db-instance-analytics-content-is-coppied-properly
  (fs/delete-tree "plugins/instance_analytics")
  (is (not (contains? (set (map str (fs/list-dir "plugins")))
                      "plugins/instance_analytics")))

  (#'audit-db/ia-content->plugins)
  (is (= #{"plugins/instance_analytics/collections"
           "plugins/instance_analytics/databases"}
         (set (map str (fs/list-dir "plugins/instance_analytics"))))))
