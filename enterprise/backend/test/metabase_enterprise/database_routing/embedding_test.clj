(ns ^:mb/driver-tests metabase-enterprise.database-routing.embedding-test
  "Tests for database routing with embedding functionality."
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-routing.e2e-test :refer [with-temp-dbs! execute-statement!]]
   [metabase.driver.settings :as driver.settings]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(defn random-embedding-secret-key [] (u.random/secure-hex 32))

(def ^:dynamic *secret-key* nil)

(defn sign [claims] (jwt/sign claims *secret-key*))

(defn do-with-new-secret-key! [f]
  (binding [*secret-key* (random-embedding-secret-key)]
    (mt/with-temporary-setting-values [embedding-secret-key *secret-key*]
      (f))))

(defmacro with-new-secret-key! {:style/indent 0} [& body]
  `(do-with-new-secret-key! (fn [] ~@body)))

(defmacro with-embedding-enabled-and-new-secret-key! {:style/indent 0} [& body]
  `(mt/with-temporary-setting-values [~'enable-embedding-static true
                                      ~'enable-embedding-interactive true]
     (with-new-secret-key!
       ~@body)))

(defn card-token [card-or-id & [additional-token-keys]]
  (sign (merge {:resource {:question (u/the-id card-or-id)}
                :params   {}}
               additional-token-keys)))

(deftest guest-embedding-with-database-routing-test
  (testing "Guest embedding should work with database routing by bypassing routing"
    (mt/with-premium-features #{:database-routing}
      (binding [driver.settings/*allow-testing-h2-connections* true]
        (with-temp-dbs! [router-db destination-db]
          ;; Set up router and destination database
          (t2/update! :model/Database (u/the-id destination-db) {:name "destination-db" :router_database_id (u/the-id router-db)})
          ;; Sync the router database to ensure tables are available
          (sync/sync-database! router-db)
          ;; Set up database routing configuration
          (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                  :user_attribute "db_name"}
                         :model/Card card {:enable_embedding true
                                           :dataset_query     {:database (u/the-id router-db)
                                                               :type     :query
                                                               :query    {:source-table (t2/select-one-pk :model/Table :db_id (u/the-id router-db))}}}]
            ;; Add test data to both databases
            (execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router-data')")
            (execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination-data')")

            (with-embedding-enabled-and-new-secret-key!
              (testing "Guest embedding should successfully query the router database"
                (let [token    (card-token card)
                      response (client/client :get 202 (str "embed/card/" token "/query"))]
                  (is (= [["router-data"]] (mt/rows response))
                      "Guest embedding should return data from router database, not destination database"))))))))))
