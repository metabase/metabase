(ns metabase.driver.sql-jdbc.sync.metadata-connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc]
   [metabase.driver.sql-jdbc.execute :as execute]
   [metabase.driver.sql-jdbc.sync.describe-table :as describe]
   [metabase.sync.db :as sync.db]
   [metabase.sync.fetch-metadata :as fetch]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt])
  (:import
   (java.sql Connection SQLException)))

(set! *warn-on-reflection* true)

(defn- with-connections! [f]
  (let [connections (atom [])]
    (with-redefs [execute/do-with-connection-with-options
                  (fn [_driver database options callback]
                    (let [closed? (atom false)
                          valid? (atom true)
                          conn (reify Connection
                                 (isClosed [_] @closed?)
                                 (isValid [_ _] @valid?)
                                 (close [_] (reset! closed? true)))]
                      (swap! connections conj {:connection conn :closed? closed? :valid? valid? :database database :options options})
                      (try (callback conn)
                           (finally (when-not (:keep-open? options) (.close conn))))))]
      (with-redefs-fn {#'describe/describe-table*
                       (fn [_driver ^Connection conn table]
                         (is (not (.isClosed conn)))
                         (case (:action table)
                           :close (.close conn)
                           :throw (throw (ex-info "metadata failure" {}))
                           :invalidate (let [state (first (filter #(identical? conn (:connection %)) @connections))]
                                         (reset! (:valid? state) false)
                                         (throw (SQLException. "broken connection")))
                           nil)
                         {:name (:name table) :fields #{{:name "id" :base-type :type/Integer}}})}
        #(f connections)))))

(defn- rows [database tables]
  (eduction (map #(describe/describe-table :sql-jdbc database %)) tables))

(deftest reuse-and-close-test
  (with-connections!
    (fn [connections]
      (let [tables [{:name "birds"} {:name "nests"}]
            metadata (describe/reducible-table-metadata :sql-jdbc {:id 1} (rows {:id 1} tables))]
        (is (empty? @connections) "Constructing metadata must not acquire a connection")
        (dotimes [iteration 2]
          (is (= (mapv #(assoc % :fields #{{:name "id" :base-type :type/Integer}}) tables)
                 (into [] metadata)))
          (is (= (inc iteration) (count @connections)) "One connection per reduction")
          (is (every? #(deref (:closed? %)) @connections)))))))

(deftest empty-and-custom-reader-test
  (with-connections!
    (fn [connections]
      (doseq [tables [[] [{:name "custom"}]]]
        (is (= tables (into [] (describe/reducible-table-metadata :sql-jdbc {:id 1} tables)))))
      (is (= [1 2] (into [] (describe/reducible-table-metadata ::non-jdbc {:id 1} [1 2]))))
      (is (empty? @connections)))))

(deftest early-termination-and-error-test
  (doseq [action [:stop :throw]]
    (with-connections!
      (fn [connections]
        (let [metadata (describe/reducible-table-metadata
                        :sql-jdbc {:id 1}
                        (rows {:id 1} [{:name "birds" :action action} {:name "nests"}]))]
          (if (= action :throw)
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"metadata failure" (into [] metadata)))
            (is (= 1 (count (into [] (take 1) metadata)))))
          (is (= 1 (count @connections)))
          (is (every? #(deref (:closed? %)) @connections)))))))

(deftest closed-connection-replacement-test
  (with-connections!
    (fn [connections]
      (is (= 3 (count (into [] (describe/reducible-table-metadata
                                :sql-jdbc {:id 1}
                                (rows {:id 1} [{:name "birds" :action :close}
                                               {:name "nests"} {:name "eggs"}]))))))
      (is (= 2 (count @connections)))
      (is (every? #(= {:id 1} (:database %)) @connections))
      (is (every? #(true? (get-in % [:options :keep-open?])) @connections))
      (is (every? #(deref (:closed? %)) @connections)))))

(deftest standalone-and-other-database-test
  (with-connections!
    (fn [connections]
      (dotimes [_ 2] (describe/describe-table :sql-jdbc {:id 1} {:name "birds"}))
      (is (= 2 (count @connections)) "Standalone calls retain their connection lifetime")
      (is (= 2 (count (into [] (describe/reducible-table-metadata
                                :sql-jdbc {:id 1} (rows {:id 2} [{:name "birds"} {:name "nests"}]))))))
      (is (= 4 (count @connections)) "A different database must not use the scoped connection")
      (is (every? #(deref (:closed? %)) @connections)))))

(deftest other-thread-test
  (with-connections!
    (fn [connections]
      (is (= 2 (count (into [] (describe/reducible-table-metadata
                                :sql-jdbc {:id 1}
                                (eduction (map (fn [_]
                                                 @(future (describe/describe-table :sql-jdbc {:id 1} {:name "birds"}))))
                                          (range 2)))))))
      (is (= 2 (count @connections)) "An inherited binding must not share a JDBC connection across threads")
      (is (every? #(deref (:closed? %)) @connections)))))

(deftest failed-initial-acquisition-test
  (with-connections!
    (fn [connections]
      (let [acquire execute/do-with-connection-with-options
            attempts (atom 0)]
        (with-redefs [execute/do-with-connection-with-options
                      (fn [& args]
                        (if (= 1 (swap! attempts inc))
                          (throw (ex-info "connection failure" {}))
                          (apply acquire args)))]
          (let [metadata (describe/reducible-table-metadata
                          :sql-jdbc {:id 1}
                          (eduction (map (fn [table]
                                           (try (describe/describe-table :sql-jdbc {:id 1} table)
                                                (catch clojure.lang.ExceptionInfo _ :failed))))
                                    [{:name "birds"} {:name "nests"}]))]
            (is (= [:failed "nests"] (mapv #(if (map? %) (:name %) %) (into [] metadata)))))))
      (is (= 1 (count @connections)))
      (is (every? #(deref (:closed? %)) @connections)))))

(deftest invalid-connection-replacement-test
  (with-connections!
    (fn [connections]
      (let [metadata (describe/reducible-table-metadata
                      :sql-jdbc {:id 1}
                      (eduction (map (fn [table]
                                       (try (describe/describe-table :sql-jdbc {:id 1} table)
                                            (catch SQLException _ :failed))))
                                [{:name "birds" :action :invalidate} {:name "nests"}]))]
        (is (= [:failed "nests"] (mapv #(if (map? %) (:name %) %) (into [] metadata)))))
      (is (= 2 (count @connections)))
      (is (every? #(deref (:closed? %)) @connections)))))

(deftest fallback-traversal-test
  (with-connections!
    (fn [connections]
      (mt/with-dynamic-fn-redefs [sync-util/reducible-sync-tables (fn [& _] [{:id 1} {:id 2}])
                                  sync.db/table (fn [id] {:id id :schema "public" :name (str "birds_" id)})
                                  fetch/table-fields-metadata
                                  (fn [database table] (:fields (describe/describe-table :sql-jdbc database table)))]
        (let [metadata (#'fetch/describe-fields-using-describe-table :sql-jdbc {:id 1})]
          (is (empty? @connections))
          (is (= #{{:name "id" :base-type :type/Integer :table-schema "public" :table-name "birds_1"}
                   {:name "id" :base-type :type/Integer :table-schema "public" :table-name "birds_2"}}
                 (into #{} metadata)))
          (is (= 1 (count @connections)))
          (is (every? #(deref (:closed? %)) @connections)))))))
