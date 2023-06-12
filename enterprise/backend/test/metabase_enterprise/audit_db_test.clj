(ns metabase-enterprise.audit-db-test
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.test :refer [deftest is]]
            [metabase-enterprise.audit-db :as audit-db]
            [metabase.models.database :refer [Database]]
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
           (#'metabase.core/ensure-audit-db-installed!))))))

(deftest audit-db-is-installed-then-left-alone
  (mt/test-drivers #{:postgres}
    (with-audit-db-restoration
      (t2/delete! Database :is_audit true)
      (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-db-installed!)))
      (is (= :metabase-enterprise.audit-db/no-op (audit-db/ensure-db-installed!)))

      (t2/update! Database :is_audit true {:engine "datomic"})
      (is (= :metabase-enterprise.audit-db/updated (audit-db/ensure-db-installed!)))
      (is (= :metabase-enterprise.audit-db/no-op (audit-db/ensure-db-installed!))))))

(deftest audit-db-content-is-not-installed-when-not-found
  (mt/test-drivers #{:postgres}
    (with-audit-db-restoration
      (with-redefs [audit-db/analytics-root-dir-resource nil]
        (is (= nil audit-db/analytics-root-dir-resource))
        (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-audit-db-installed!)))
        (is (= 13371337 (t2/select-one-fn :id 'Database {:where [:= :is_audit true]}))
            "Audit DB is installed.")
        (is (= [] (t2/select 'Card {:where [:= :database_id 13371337]}))
            "No cards created for Audit DB.")))))

(deftest audit-db-content-is-installed-when-found
  (mt/test-drivers #{:postgres}
    (with-audit-db-restoration
      (with-redefs [audit-db/analytics-root-dir-resource (io/resource "instance_analytics.zip")]
        (is (str/ends-with? (str audit-db/analytics-root-dir-resource) ".zip"))
        (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-audit-db-installed!)))
        (is (= 13371337 (t2/select-one-fn :id 'Database {:where [:= :is_audit true]}))
            "Audit DB is installed.")
        (is (not= 0 (t2/count 'Card {:where [:= :database_id 13371337]}))
            "Cards should be created for Audit DB when the content is there.")))))
