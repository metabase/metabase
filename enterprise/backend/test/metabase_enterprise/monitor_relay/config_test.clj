(ns metabase-enterprise.monitor-relay.config-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.config :as relay.config]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest target-test
  (mt/with-temp-env-var-value! [mb-metabase-monitor-url nil]
    (mt/with-temporary-setting-values [metabase-monitor-url nil]
      (testing "nothing set"
        (is (= {:status :unset} (relay.config/target))))
      (testing "the URL an admin saved"
        (mt/with-temporary-setting-values [metabase-monitor-url "http://m:8080/ingest/db-tok"]
          (is (= {:status :ok, :base "http://m:8080", :token "db-tok"} (relay.config/target))))))))

(deftest env-target-test
  (mt/with-temporary-setting-values [metabase-monitor-url "http://db:8080/ingest/db-tok"]
    (testing "the environment variable wins over the URL an admin saved"
      (mt/with-temp-env-var-value! [mb-metabase-monitor-url "http://env:8080/ingest/env-tok"]
        (is (= {:status :ok, :base "http://env:8080", :token "env-tok"} (relay.config/target)))))
    (testing "a malformed URL can come only from the environment"
      (mt/with-temp-env-var-value! [mb-metabase-monitor-url "http://env:8080/env-tok"]
        (is (= {:status :malformed} (relay.config/target)))))))
