(ns ^:mb/driver-tests metabase-enterprise.database-routing.result-metadata-test
  "Tests that query results routed to a destination database carry no column fingerprint, since the stored
  fingerprint was synced from the router database and describes rows the routed user never queries (BOT-2115)."
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase-enterprise.database-routing.e2e-test :as e2e]
   [metabase-enterprise.test :as met]
   [metabase.driver.settings :as driver.settings]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache-test :as cache-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- col-fingerprints
  "`{col-name fingerprint}` for every col in a query `result`."
  [result]
  (into {} (map (juxt :name :fingerprint)) (mt/cols result)))

(def ^:private router-fingerprint
  "Stands in for the fingerprint sync computes over the router database's rows."
  {:global {:distinct-count 3, :nil% 0.0}
   :type   {:type/Text {:percent-json 0.0, :percent-url 0.0, :percent-email 0.0, :percent-state 0.0, :average-length 6.0}}})

(defn- do-with-routed-table!
  "Stand up a router with one destination, routing `:rasta` to the destination and `:crowberto` to the router itself.
  The router table's only field gets a stored fingerprint. Calls `f` with the router DB and the table id."
  [f]
  (mt/with-premium-features #{:database-routing}
    (binding [driver.settings/*allow-testing-h2-connections* true]
      (met/with-user-attributes! :crowberto {"db_name" "__METABASE_ROUTER__"}
        (met/with-user-attributes! :rasta {"db_name" "destination-db"}
          (e2e/with-routing-setup! [router-db [[destination-db "destination-db"]]]
            (mt/with-temp [:model/DatabaseRouter _ {:database_id    (u/the-id router-db)
                                                    :user_attribute "db_name"}]
              (e2e/execute-statement! router-db "INSERT INTO \"my_database_name\" (str) VALUES ('router')")
              (e2e/execute-statement! destination-db "INSERT INTO \"my_database_name\" (str) VALUES ('destination')")
              (let [table-id (t2/select-one-pk :model/Table :db_id (u/the-id router-db))]
                (t2/update! :model/Field :table_id table-id {:fingerprint router-fingerprint})
                (f router-db table-id)))))))))

(defn- table-query [router-db table-id]
  {:database (u/the-id router-db)
   :type     :query
   :query    {:source-table table-id}})

(deftest routed-results-omit-fingerprints-test
  (testing "BOT-2115: result cols for a user routed to a destination database carry no fingerprint"
    (do-with-routed-table!
     (fn [router-db table-id]
       (let [query  (table-query router-db table-id)
             result (mt/user-http-request :rasta :post 202 "dataset" query)]
         (testing "sanity check: the query was routed"
           (is (= [["destination"]] (mt/rows result))))
         (is (every? nil? (vals (col-fingerprints result))))
         (testing "a user routed to the router itself still gets the fingerprint"
           (let [result (mt/user-http-request :crowberto :post 202 "dataset" query)]
             (is (= [["router"]] (mt/rows result)))
             (is (=? {"STR" router-fingerprint} (col-fingerprints result))))))))))

(deftest routed-cached-results-omit-fingerprints-test
  (testing "BOT-2115: a cached result replayed to a routed user carries no fingerprint"
    (do-with-routed-table!
     (fn [router-db table-id]
       (cache-test/with-mock-cache! [save-chan]
         (mt/with-test-user :rasta
           (letfn [(run-query []
                     (qp/process-query (assoc (table-query router-db table-id)
                                              :cache-strategy {:type             :ttl
                                                               :multiplier       60
                                                               :avg-execution-ms 10
                                                               :min_duration_ms  0})))]
             (let [result (run-query)]
               (is (nil? (:cached (:cache/details result))))
               (is (= [["destination"]] (mt/rows result)))
               (is (every? nil? (vals (col-fingerprints result)))))
             (testing "cache entry should be saved within 5 seconds"
               (let [[_ chan] (a/alts!! [save-chan (a/timeout 5000)])]
                 (is (= save-chan chan))))
             (let [result (run-query)]
               (is (true? (:cached (:cache/details result))))
               (is (every? nil? (vals (col-fingerprints result))))))))))))
