(ns metabase.transforms-base.query-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.transforms-base.query :as transforms-base.query]
   [metabase.transforms-base.util :as transforms-base.u]))

(defn- capture-run-query-transform!
  "Invoke run-query-transform! against a temp DB + transform-shaped map with
   driver side effects stubbed out. Returns the `transform-details` map that
   would have been passed to `driver/run-transform!`."
  [opts]
  (let [captured (atom nil)]
    (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
      (let [transform {:id     1
                       :source {:type  :query
                                :query {:database db-id
                                        :type     :native
                                        :native   {:query "SELECT 1"}}}
                       :target {:type   "table"
                                :schema "from_schema"
                                :name   "orders"}}
            created-schemas (atom [])]
        (with-redefs [transforms-base.u/throw-if-db-routing-enabled! (fn [& _] nil)
                      transforms-base.u/compile-source                (fn [& _] {:query "SELECT 1"})
                      transforms-base.u/required-database-features    (fn [& _] [])
                      driver.u/supports?                              (fn [& _] true)
                      driver/connection-spec                          (fn [& _] {:stub :conn})
                      driver/schema-exists?                           (fn [& _] false)
                      driver/create-schema-if-needed!                 (fn [_driver _conn schema]
                                                                        (swap! created-schemas conj schema))
                      driver/run-transform!                           (fn [_driver details _opts]
                                                                        (reset! captured details)
                                                                        {:ok true})]
          (let [result (transforms-base.query/run-query-transform! transform opts)]
            {:result          result
             :details         @captured
             :created-schemas @created-schemas}))))))

(deftest run-query-transform-without-remapping-test
  (testing "no :table-remapping -> output-schema/output-table follow the transform's declared target"
    (let [{:keys [result details created-schemas]} (capture-run-query-transform! nil)]
      (is (= :succeeded (:status result)))
      (is (= "from_schema" (:output-schema details)))
      (is (= :from_schema/orders (:output-table details)))
      (is (= ["from_schema"] created-schemas)))))

(deftest run-query-transform-with-remapping-test
  (testing ":table-remapping overrides both schema and table name, and schema creation targets the remapped schema"
    (let [{:keys [result details created-schemas]}
          (capture-run-query-transform! {:table-remapping {:schema "ws_xyz"
                                                           :name   "from_schema__orders"}})]
      (is (= :succeeded (:status result)))
      (is (= "ws_xyz" (:output-schema details)))
      (is (= :ws_xyz/from_schema__orders (:output-table details)))
      (is (= ["ws_xyz"] created-schemas)
          "schema creation must use the remapped schema, not the transform's declared target"))))

(deftest remapped-table-name-short-test
  (testing "inputs under max-len pass through as schema__name"
    (is (= "a__b" (transforms-base.query/remapped-table-name "a" "b")))
    (is (= "public__orders" (transforms-base.query/remapped-table-name "public" "orders")))))

(deftest remapped-table-name-determinism-test
  (testing "same input -> same output"
    (is (= (transforms-base.query/remapped-table-name "schema_a" "orders" 63)
           (transforms-base.query/remapped-table-name "schema_a" "orders" 63)))))

(deftest remapped-table-name-collision-resistance-test
  (testing "different (schema, name) -> different outputs, even when they'd collide after naive truncation"
    (let [long-a "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          long-b (apply str (concat (repeat 57 \b)))
          max-len 20
          na (transforms-base.query/remapped-table-name long-a "tbl" max-len)
          nb (transforms-base.query/remapped-table-name long-b "tbl" max-len)]
      (is (<= (count na) max-len))
      (is (<= (count nb) max-len))
      (is (not= na nb))))
  (testing "same schema different table stays distinct"
    (is (not= (transforms-base.query/remapped-table-name "s" "a" 63)
              (transforms-base.query/remapped-table-name "s" "b" 63)))))

(deftest remapped-table-name-max-len-test
  (testing "max-len is respected even for short inputs with long hash suffix"
    (let [out (transforms-base.query/remapped-table-name "extremely_long_schema_name"
                                                         "extremely_long_table_name"
                                                         20)]
      (is (<= (count out) 20)))))

(deftest workspace-stub-test
  (testing "OSS stubs are off by default (when the EE impl is not configured)"
    (with-redefs [transforms-base.query/active?              (constantly false)
                  transforms-base.query/db-workspace-schema  (constantly nil)]
      (is (false? (transforms-base.query/active?)))
      (is (nil? (transforms-base.query/db-workspace-schema 1)))
      (is (nil? (transforms-base.query/db-workspace-schema 999))))))

(deftest workspaces-active-without-remapping-aborts-test
  (testing "when active? is true and no :table-remapping is provided, the run aborts before touching the warehouse"
    (let [ran-driver? (atom false)
          created?    (atom false)]
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
        (let [transform {:id     1
                         :source {:type  :query
                                  :query {:database db-id
                                          :type     :native
                                          :native   {:query "SELECT 1"}}}
                         :target {:type   "table"
                                  :schema "from_schema"
                                  :name   "orders"}}]
          (with-redefs [transforms-base.query/active?        (constantly true)
                        transforms-base.u/throw-if-db-routing-enabled!  (fn [& _] nil)
                        transforms-base.u/compile-source                (fn [& _] {:query "SELECT 1"})
                        transforms-base.u/required-database-features    (fn [& _] [])
                        driver.u/supports?                              (fn [& _] true)
                        driver/connection-spec                          (fn [& _] {:stub :conn})
                        driver/schema-exists?                           (fn [& _] (reset! created? :checked) false)
                        driver/create-schema-if-needed!                 (fn [& _] (reset! created? true))
                        driver/run-transform!                           (fn [& _] (reset! ran-driver? true) {:ok true})]
            (let [result (transforms-base.query/run-query-transform! transform nil)]
              (is (= :failed (:status result)))
              (is (some? (:error result)))
              (is (false? @ran-driver?) "driver/run-transform! must not be called")
              (is (not= true @created?) "schema creation must not happen"))))))))

(deftest workspaces-active-with-remapping-runs-test
  (testing "when active? is true AND :table-remapping is provided, the run proceeds normally"
    (let [ran-driver? (atom false)]
      (mt/with-temp [:model/Database {db-id :id} {:engine :h2}]
        (let [transform {:id     1
                         :source {:type  :query
                                  :query {:database db-id
                                          :type     :native
                                          :native   {:query "SELECT 1"}}}
                         :target {:type   "table"
                                  :schema "from_schema"
                                  :name   "orders"}}]
          (with-redefs [transforms-base.query/active?        (constantly true)
                        transforms-base.u/throw-if-db-routing-enabled!  (fn [& _] nil)
                        transforms-base.u/compile-source                (fn [& _] {:query "SELECT 1"})
                        transforms-base.u/required-database-features    (fn [& _] [])
                        driver.u/supports?                              (fn [& _] true)
                        driver/connection-spec                          (fn [& _] {:stub :conn})
                        driver/schema-exists?                           (fn [& _] false)
                        driver/create-schema-if-needed!                 (fn [& _] nil)
                        driver/run-transform!                           (fn [& _] (reset! ran-driver? true) {:ok true})]
            (let [result (transforms-base.query/run-query-transform!
                          transform
                          {:table-remapping {:schema "ws_xyz" :name "from_schema__orders"}})]
              (is (= :succeeded (:status result)))
              (is (true? @ran-driver?)))))))))
