(ns metabase.config-test
  (:require [clojure.test :refer :all]
            [environ.core :as environ]
            [metabase.config :as config]))

(deftest config-parsing
  (testing "takes value of non-empty env var"
    (with-redefs [environ/env (assoc environ/env :max-session-age "123")]
      (is (= "123"
             (config/config-str :max-session-age)))))
  (testing "falls back to default if env var is nil or an empty string"
    (with-redefs [environ/env (assoc environ/env :max-session-age "")]
      (is (= "20160"
             (config/config-str :max-session-age))))
    (with-redefs [environ/env (assoc environ/env :max-session-age nil)]
      (is (= "20160"
             (config/config-str :max-session-age))))))
