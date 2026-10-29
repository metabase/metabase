(ns metabase-enterprise.semantic-layer-import.dbt.adapter-test
  "The check that the config's `:driver` agrees with the dbt adapter the manifest was written with
  ([[adapter/warehouse]], then [[semantic-layer-import/check-driver]]), on its own and as [[dbt-import/convert!]] runs
  it, before anything is written."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [mb.hawk.assert-exprs]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
   [metabase-enterprise.semantic-layer-import.dbt.adapter :as adapter]
   [metabase-enterprise.semantic-layer-import.dbt.core :as dbt-import]
   [metabase-enterprise.semantic-layer-import.dbt.test-util :as tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- check-driver
  "Check the config's `driver` against a manifest written with the dbt adapter `adapter-type`."
  [driver adapter-type]
  (semantic-layer-import/check-driver driver (adapter/warehouse adapter-type)))

(deftest ^:parallel warehouse-test
  (is (= {:type "trino", :driver :starburst} (adapter/warehouse "trino")))
  (is (= {:type "duckdb", :driver nil} (adapter/warehouse "duckdb"))
      "an adapter for a warehouse Metabase has no driver for")
  (is (= {:type nil, :driver nil} (adapter/warehouse nil))
      "a manifest that records no adapter"))

(deftest ^:parallel check-driver-test
  (testing "a driver that is the adapter's passes without a word"
    (log.capture/with-log-messages-for-level [messages [metabase-enterprise.semantic-layer-import.core :warn]]
      (is (nil? (check-driver :postgres "postgres")))
      (is (nil? (check-driver :bigquery-cloud-sdk "bigquery")))
      (is (nil? (check-driver :starburst "trino")))
      (is (= [] (messages)))))
  (testing "a driver that is another warehouse's fails, naming the adapter, its driver and the config's"
    (is (thrown-with-msg? ExceptionInfo
                          (re-pattern (str "^The semantic layer was written for the warehouse \"snowflake\", which"
                                           " Metabase connects to with the :snowflake driver, but the config's :driver"
                                           " is :postgres"))
                          (check-driver :postgres "snowflake")))
    (is (= {:warehouse-type "snowflake", :expected-driver :snowflake, :driver :postgres}
           (try
             (check-driver :postgres "snowflake")
             (catch ExceptionInfo e
               (ex-data e))))))
  (testing "an adapter with no Metabase driver, or none recorded, is a warning and the config stands"
    (log.capture/with-log-messages-for-level [messages [metabase-enterprise.semantic-layer-import.core :warn]]
      (is (nil? (check-driver :postgres "duckdb")))
      (is (nil? (check-driver :postgres nil)))
      (is (=? [{:level   :warn
                :message (str "No Metabase driver is known for the warehouse \"duckdb\"; taking the config's :driver"
                              " :postgres at its word")}
               {:level   :warn
                :message "The semantic layer names no warehouse; taking the config's :driver :postgres at its word"}]
              (messages))))))

(deftest convert!-checks-driver-test
  (mt/with-temp-dir [dir nil]
    (let [manifest-file (io/file dir "manifest.json")
          out-dir       (io/file dir "out")
          convert!      (fn [config]
                          (dbt-import/convert! {:manifest (str manifest-file)
                                                :out-dir  (str out-dir)
                                                :config   config}))]
      (spit manifest-file (json/encode (tu/build-manifest {})))
      (testing "a :driver that disagrees with the manifest's adapter_type fails the run before anything is written"
        (is (thrown-with-msg? ExceptionInfo
                              #"written for the warehouse \"postgres\".*but the config's :driver is :mysql"
                              (convert! (assoc tu/default-config :driver :mysql))))
        (is (not (.exists out-dir))))
      (testing "the adapter's own driver converts"
        (is (= ["m"] (map :name (:converted (convert! tu/default-config)))))))))
