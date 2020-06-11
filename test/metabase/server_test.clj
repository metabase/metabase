(ns metabase.server-test
  (:require [clojure.test :refer :all]
            [metabase
             [config :as config]
             [server :as server]]))

(deftest config-test
  (testing "Make sure our Jetty config functions work as expected/we don't accidentally break things (#9333)"
    (with-redefs [config/config-str (constantly "10")]
      (is (= {:keystore       "10"
              :max-queued     10
              :request-header-size 10
              :port           10
              :min-threads    10
              :host           "10"
              :daemon?        false
              :ssl?           true
              :trust-password "10"
              :key-password   "10"
              :truststore     "10"
              :max-threads    10
              :max-idle-time  10
              :ssl-port       10}
             (#'server/jetty-config))))))
