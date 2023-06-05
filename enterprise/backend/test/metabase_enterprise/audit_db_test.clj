(ns metabase-enterprise.audit-db-test
  (:require [clojure.test :refer [deftest is]]
            [metabase-enterprise.audit-db :as audit-db]
            [metabase.models.database :refer [Database]]
            [toucan2.core :as t2]))

(deftest audit-db-is-installed-then-left-alone
  (let [original-audit-db (t2/select-one Database :is_audit true)]
    (try
      (t2/delete! Database :is_audit true)
      (is (= :metabase-enterprise.audit-db/installed (audit-db/ensure-db-installed!)))
      (is (= :metabase-enterprise.audit-db/no-op (audit-db/ensure-db-installed!)))

      (t2/update! Database :is_audit true {:engine "datomic"})
      (is (= :metabase-enterprise.audit-db/updated (audit-db/ensure-db-installed!)))
      (is (= :metabase-enterprise.audit-db/no-op (audit-db/ensure-db-installed!)))

      (finally
        (t2/delete! Database :is_audit true)
        (when original-audit-db
          (audit-db/ensure-audit-db-installed!))))))
