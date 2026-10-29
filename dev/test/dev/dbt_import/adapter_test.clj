(ns dev.dbt-import.adapter-test
  "The check that the config's `:driver` agrees with the dbt adapter the manifest was written with
  ([[adapter/check-driver]]), on its own and as [[dbt-import/convert!]] runs it, before anything is written."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.adapter :as adapter]
   [dev.dbt-import.core :as dbt-import]
   [dev.dbt-import.test-util :as tu]
   [mb.hawk.assert-exprs]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest ^:parallel check-driver-test
  (testing "a driver that is the adapter's passes without a word"
    (log.capture/with-log-messages-for-level [messages [dev.dbt-import.adapter :warn]]
      (is (nil? (adapter/check-driver :postgres "postgres")))
      (is (nil? (adapter/check-driver :bigquery-cloud-sdk "bigquery")))
      (is (nil? (adapter/check-driver :starburst "trino")))
      (is (= [] (messages)))))
  (testing "a driver that is another warehouse's fails, naming the adapter, its driver and the config's"
    (is (thrown-with-msg? ExceptionInfo
                          (re-pattern (str "^The manifest was written with the dbt adapter \"snowflake\", whose"
                                           " warehouse Metabase connects to with the :snowflake driver, but the"
                                           " config's :driver is :postgres"))
                          (adapter/check-driver :postgres "snowflake")))
    (is (= {:adapter-type "snowflake", :expected-driver :snowflake, :driver :postgres}
           (try
             (adapter/check-driver :postgres "snowflake")
             (catch ExceptionInfo e
               (ex-data e))))))
  (testing "an adapter with no Metabase driver, or none recorded, is a warning and the config stands"
    (log.capture/with-log-messages-for-level [messages [dev.dbt-import.adapter :warn]]
      (is (nil? (adapter/check-driver :postgres "duckdb")))
      (is (nil? (adapter/check-driver :postgres nil)))
      (is (=? [{:level   :warn
                :message (str "No Metabase driver is known for the dbt adapter \"duckdb\"; taking the config's :driver"
                              " :postgres at its word")}
               {:level   :warn
                :message "The manifest records no adapter_type; taking the config's :driver :postgres at its word"}]
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
                              #"written with the dbt adapter \"postgres\".*but the config's :driver is :mysql"
                              (convert! (assoc tu/default-config :driver :mysql))))
        (is (not (.exists out-dir))))
      (testing "the adapter's own driver converts"
        (is (= ["m"] (map :name (:converted (convert! tu/default-config)))))))))
