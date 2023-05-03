(ns metabase-enterprise.audit-db-test
  (:require [clojure.test :refer [deftest is]]
            [metabase-enterprise.audit-db :as audit-db]
            [metabase.models.database :refer [Database]]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(defmacro with-delete-audit-db [& body]
  `(let [original-audit-db# (t2/select-one Database :is_audit true)]
     (try
       (t2/delete! Database :is_audit true)
       ~@body
       (finally
         (t2/delete! Database :is_audit true)
         (when original-audit-db#
           (log/fatal (str "Original Audit DB: " (pr-str original-audit-db#)))
           (#'t2/insert! Database original-audit-db#))))))

(deftest audit-db-is-installed-then-left-alone
  (with-delete-audit-db
    (is (= ::audit-db/installed (audit-db/ensure-db-installed!)))
    (is (= ::audit-db/no-op (audit-db/ensure-db-installed!)))))
