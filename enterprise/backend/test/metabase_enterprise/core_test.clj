(ns metabase-enterprise.core-test
  (:require [clojure.test :refer [deftest is testing]]
            [metabase-enterprise.core]
            [metabase.config :as config]
            [metabase.models.database :refer [Database]]
            [toucan2.core :as t2]))

(defmacro with-delete-audit-db [& body]
  `(do
     (t2/delete! Database :is_audit true)
     ~@body
     (t2/delete! Database :is_audit true)))

(deftest no-op-in-oss-mode
  (if config/ee-available?
    (is (= nil (metabase-enterprise.core/ensure-audit-db-exists!)))
    (with-delete-audit-db
      (is (= :metabase-enterprise.core/installed (metabase-enterprise.core/ensure-audit-db-exists!))))))

(deftest modified-audit-db-engine-is-replaced-test
  (with-delete-audit-db
    (let [_ (metabase-enterprise.core/ensure-audit-db-exists!)
          audit-db (t2/select-one Database :is_audit true)
          _ (t2/update! Database :id (:id audit-db) {:engine "postgres"})]
      (is (= :metabase-enterprise.core/replaced
             (metabase-enterprise.core/ensure-audit-db-exists!))))))

(deftest modified-audit-db-details-replaced-test
  (with-delete-audit-db
    (let [_ (metabase-enterprise.core/ensure-audit-db-exists!)
          audit-db (t2/select-one Database :is_audit true)
          _ (def adb audit-db)
          _ (t2/update! Database :id (:id audit-db)
                        {:details {:db
                                   (str "file:/someplace/new/sample-database.db;"
                                        "USER=NEW_USER;PASSWORD=correcthorsebatterystaple")}})]
      (is (= :metabase-enterprise.core/replaced
             (metabase-enterprise.core/ensure-audit-db-exists!))))))

(deftest unmodified-audit-db-is-left-alone
  (with-delete-audit-db
    (metabase-enterprise.core/ensure-audit-db-exists!)
    (is (= :metabase-enterprise.core/no-op
           (metabase-enterprise.core/ensure-audit-db-exists!)))))
