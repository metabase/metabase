(ns metabase.config-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.config.env :as config.env]))

(deftest ^:parallel config-parsing
  (testing "takes value of non-empty env var"
    (binding [config.env/*env* (assoc config.env/*env* :max-session-age "123")]
      (is (= "123"
             (config/config-str :max-session-age)))))
  (testing "falls back to default if env var is nil or an empty string"
    (binding [config.env/*env* (assoc config.env/*env* :max-session-age "")]
      (is (= "20160"
             (config/config-str :max-session-age))))
    (binding [config.env/*env* (assoc config.env/*env* :max-session-age nil)]
      (is (= "20160"
             (config/config-str :max-session-age))))))
