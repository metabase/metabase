(ns metabase.sync.sync-metadata.dbms-version-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.models.database :refer [Database]]
   [metabase.sync.sync-metadata.dbms-version :as sync-dbms-ver]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- db-dbms-version [db-or-id]
  (t2/select-one-fn :dbms_version Database :id (u/the-id db-or-id)))

(defn- check-dbms-version [dbms-version]
  (me/humanize (mc/explain [:maybe sync-dbms-ver/DBMSVersion] dbms-version)))

(deftest dbms-version-test
  (mt/test-drivers (mt/normal-drivers)
    (testing (str "This tests populating the dbms_version field for a given database."
                  " The sync happens automatically, so this test removes it first"
                  " to ensure that it gets set when missing.")
      (mt/dataset test-data
        (let [db                   (mt/db)
              version-on-load      (db-dbms-version db)
              _                    (t2/update! Database (u/the-id db) {:dbms_version nil})
              db                   (t2/select-one Database :id (u/the-id db))
              version-after-update (db-dbms-version db)
              _                    (sync-dbms-ver/sync-dbms-version! db)]
          (testing "On startup is the dbms-version specified?"
            (is (nil? (check-dbms-version version-on-load))))
          (testing "Check to make sure the test removed the timezone"
            (is (nil? version-after-update)))
          (testing "Check that the value was set again after sync"
            (is (nil? (check-dbms-version (db-dbms-version db))))))))))
