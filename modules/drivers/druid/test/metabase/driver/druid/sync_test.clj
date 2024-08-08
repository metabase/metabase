(ns metabase.driver.druid.sync-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.driver :as driver]
   [metabase.driver.druid.client :as druid.client]
   [metabase.driver.druid.sync :as druid.sync]
   [metabase.models.database :refer [Database]]
   [metabase.models.secret :as secret]
   [metabase.sync.sync-metadata.dbms-version :as sync-dbms-ver]
   [metabase.test :as mt]
   [metabase.timeseries-query-processor-test.util :as tqpt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest ^:parallel sync-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (testing "describe-database"
        (is (= {:tables #{{:schema nil, :name "checkins"}}}
               (driver/describe-database :druid (mt/db)))))

      (testing "describe-table"
        (is (= {:schema nil
                :name   "checkins"
                :fields [{:name "timestamp",           :base-type :type/Instant,          :database-type "timestamp",            :database-position 0, :pk? false}
                         {:name "venue_name",          :base-type :type/Text,             :database-type "STRING",               :database-position 1}
                         {:name "user_password",       :base-type :type/Text,             :database-type "STRING",               :database-position 2}
                         {:name "venue_longitude",     :base-type :type/Float,            :database-type "DOUBLE",               :database-position 3}
                         {:name "venue_latitude",      :base-type :type/Float,            :database-type "DOUBLE",               :database-position 4}
                         {:name "venue_price",         :base-type :type/Integer,          :database-type "LONG",                 :database-position 5}
                         {:name "venue_category_name", :base-type :type/Text,             :database-type "STRING",               :database-position 6}
                         {:name "id",                  :base-type :type/Integer,          :database-type "LONG",                 :database-position 7}
                         {:name "count",               :base-type :type/Integer,          :database-type "LONG [metric]",        :database-position 8}
                         {:name "unique_users",        :base-type :type/DruidHyperUnique, :database-type "hyperUnique [metric]", :database-position 9}
                         {:name "user_name",           :base-type :type/Text,             :database-type "STRING",               :database-position 10}
                         {:name "user_last_login",     :base-type :type/Text,             :database-type "STRING",               :database-position 11}]}
               (-> (driver/describe-table :druid (mt/db) {:name "checkins"})
                   (update :fields (partial sort-by :database-position)))))))))

(defn- db-dbms-version [db-or-id]
  (t2/select-one-fn :dbms_version Database :id (u/the-id db-or-id)))

(defn- check-dbms-version [dbms-version]
  (me/humanize (mc/validate sync-dbms-ver/DBMSVersion dbms-version)))

(deftest dbms-version-test
  (mt/test-driver :druid
    (testing (str "This tests populating the dbms_version field for a given database."
                  " The sync happens automatically, so this test removes it first"
                  " to ensure that it gets set when missing.")
      (tqpt/with-flattened-dbdef
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

(deftest ^:synchronized auth-dbms-version-test
  (mt/test-driver
   :druid
   (testing "`dbms-version` uses auth parameters (#41579)"
     (tqpt/with-flattened-dbdef
       (let [get-args (volatile! nil)
             db-with-auth-details (update (mt/db) :details assoc
                                          :auth-enabled     true
                                          :auth-username    "admin"
                                          :auth-token-value "password1")]
         ;; Following ensures that auth parameters are passed to GET during version sync if present.
         (with-redefs [secret/value->string (constantly "password1")
                       druid.client/GET (fn [_url & params] (vreset! get-args (apply hash-map params)) nil)]
           ;; Just fill in the params with internally modified `dbms-version`.
           (druid.sync/dbms-version db-with-auth-details)
           (is (= true        (:auth-enabled     @get-args)))
           (is (= "admin"     (:auth-username    @get-args)))
           (is (= "password1" (:auth-token-value @get-args)))))))))
