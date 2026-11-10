(ns metabase-enterprise.security-center.read-only-connections-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.read-only-connections :as read-only-connections]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.security-center.schema :as security-center.schema]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- privileges
  "One row of table privileges with `overrides` on top. Select only unless told otherwise."
  [& {:as overrides}]
  [(merge {:role nil, :schema "public", :table "birds", :select true, :insert false, :update false, :delete false}
          overrides)])

(defn- refresh-with!
  "Runs the refresh with the privilege rows of each database taken from `user->privileges`, keyed by the `:user` of
  its connection details. A function as the value is called. Returns the results of the databases named in `names`."
  [user->privileges names]
  (mt/with-dynamic-fn-redefs [sql-jdbc/current-user-table-privileges-with-details
                              (fn [_driver {:keys [user]}]
                                (let [rows (get user->privileges user)]
                                  (if (fn? rows) (rows) rows)))]
    (filterv (comp (set names) :name) (:databases (read-only-connections/refresh)))))

(deftest refresh-test
  (mt/with-temp [:model/Database {router-id :id} {:name "rc router", :engine :postgres, :details {:user "reader"}}
                 :model/Database {dest-id :id}   {:name               "rc destination"
                                                  :engine             :postgres
                                                  :details            {:user "writer"}
                                                  :router_database_id router-id}
                 :model/Database {mysql-id :id}  {:name "rc mysql", :engine :mysql, :details {:user "updater"}}
                 :model/Database {sqlite-id :id} {:name "rc sqlite", :engine :sqlite, :details {:db "birds.sqlite"}}
                 :model/Database _               {:name "rc audit", :engine :postgres, :is_audit true}]
    (let [names   ["rc router" "rc destination" "rc mysql" "rc sqlite" "rc audit"]
          results (refresh-with! {"reader"  (privileges)
                                  "writer"  (privileges :insert true)
                                  "updater" (privileges :update true)}
                                 names)]
      (testing "one result per database in name order, routing destinations included, the audit database left out"
        (is (= [{:id dest-id, :name "rc destination", :engine "postgres", :result "writable"}
                {:id mysql-id, :name "rc mysql", :engine "mysql", :result "writable"}
                {:id router-id, :name "rc router", :engine "postgres", :result "read-only"}
                {:id sqlite-id, :name "rc sqlite", :engine "sqlite", :result "not-supported"}]
               results)))
      (testing "the result holds no connection details"
        (is (every? #(= #{:id :name :engine :result} (set (keys %))) results))))
    (testing "a database that can't be asked gets an error result, and the other databases are still checked"
      (is (= ["writable" "error" "read-only" "not-supported"]
             (map :result (refresh-with! {"reader"  (privileges)
                                          "writer"  (privileges :delete true)
                                          "updater" #(throw (ex-info "Connection refused" {}))}
                                         ["rc router" "rc destination" "rc mysql" "rc sqlite" "rc audit"])))))))

(deftest check-databases-test
  (let [check-databases #'read-only-connections/check-databases
        databases       [{:id 1, :engine :postgres} {:id 2, :engine :mysql} {:id 3, :engine :h2} {:id 4, :engine :oracle}]]
    (testing "a database that does not answer in time gets a timeout result, and the other databases are still checked"
      (let [stuck (promise)]
        (try
          (is (= ["read-only" "timed-out" "not-supported" "writable"]
                 (check-databases databases
                                  (fn [{:keys [id]}]
                                    (case (int id)
                                      1 "read-only"
                                      2 @stuck
                                      4 "writable"))
                                  2
                                  500)))
          (finally
            (deliver stuck "read-only")))))
    (testing "a database that waits for a thread until the time is over gets a timeout result"
      (let [stuck (promise)]
        (try
          (is (= ["timed-out" "timed-out" "not-supported" "timed-out"]
                 (check-databases databases (fn [_] @stuck) 2 200)))
          (finally
            (deliver stuck "read-only")))))
    (testing "a database with an engine outside the supported set is not asked"
      (let [asked (atom #{})]
        (check-databases databases (fn [{:keys [id]}] (swap! asked conj id) "read-only") 2 500)
        (is (= #{1 2 4} @asked))))))

(deftest ^:parallel pool-size-test
  (let [pool-size #'read-only-connections/pool-size
        databases (fn [n engine] (repeat n {:engine engine}))]
    (testing "one thread per database with a supported engine"
      (is (= 3 (pool-size (concat (databases 3 :postgres) (databases 5 :h2))))))
    (testing "at most 10 threads"
      (is (= 10 (pool-size (databases 25 :mysql)))))
    (testing "one thread when there is no database to ask"
      (is (= 1 (pool-size [])))
      (is (= 1 (pool-size (databases 2 :h2)))))))

(deftest log-test
  (testing "a database without an answer in time gets a line with its id and engine"
    (let [stuck (promise)]
      (try
        (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.read-only-connections :warn]]
          (#'read-only-connections/check-databases [{:id 7, :engine :mysql}] (fn [_] @stuck) 1 100)
          (is (=? [{:level :warn, :message #".*got no answer from database 7 \(mysql\) in 100 ms"}]
                  (messages))))
        (finally
          (deliver stuck "read-only")))))
  (testing "a refresh writes one line with the number of databases, the duration and the results"
    (mt/with-log-messages-for-level [messages [metabase-enterprise.security-center.read-only-connections :info]]
      (mt/with-dynamic-fn-redefs [sql-jdbc/current-user-table-privileges-with-details (fn [_driver _details]
                                                                                        (privileges))]
        (let [database-count (count (:databases (read-only-connections/refresh)))]
          (is (=? [{:message (re-pattern (str ".*checked " database-count " databases in \\d+ ms: \\{.+\\}"))}]
                  (filter #(= :info (:level %)) (messages)))))))))

(deftest ^:parallel items-test
  (testing "before the first refresh"
    (is (= [{:status :unknown, :message "Not checked yet"}]
           (read-only-connections/items nil))))
  (testing "with no databases"
    (is (= [{:status :pass, :message "There are no databases to check"}]
           (read-only-connections/items {:databases []}))))
  (testing "one item per database, from the result as it is read back from JSON"
    (let [stored (json/decode+kw
                  (json/encode
                   {:databases [{:id 1, :name "Birds", :engine "postgres", :result "read-only"}
                                {:id 2, :name "Sales", :engine "mysql", :result "writable"}
                                {:id 3, :name "Sample Database", :engine "sqlite", :result "not-supported"}
                                {:id 4, :name "Slow", :engine "oracle", :result "timed-out"}
                                {:id 5, :name "Down", :engine "sqlserver", :result "error"}
                                {:id 6, :name "Gone", :engine "no-such-engine", :result "not-supported"}]}))
          items  (read-only-connections/items stored)]
      (is (= [[:pass "The connection user of Birds can't write"]
              [:fail "The connection user of Sales can insert, update or delete"]
              [:unknown "SQLite is not supported"]
              [:unknown "Timed out after 30 s"]
              [:unknown "Couldn't check Down. Check the server logs for the underlying error."]
              [:unknown "no-such-engine is not supported"]]
             (map (juxt :status :message) items)))
      (is (= [[:database 1 "Birds"] [:database 2 "Sales"]]
             (map (juxt :entity_type :entity_id :entity_name) (take 2 items))))
      (is (mr/validate [:sequential ::security-center.schema/health-check-item] items)))))
