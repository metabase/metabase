(ns metabase.config-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase.config :as config]
   [metabase.test :as mt]))

(deftest config-parsing
  (testing "takes value of non-empty env var"
    (mt/with-dynamic-redefs [env/env (assoc env/env :max-session-age "123")]
      (is (= "123"
             (config/config-str :max-session-age)))))
  (testing "falls back to default if env var is nil or an empty string"
    (mt/with-dynamic-redefs [env/env (assoc env/env :max-session-age "")]
      (is (= "20160"
             (config/config-str :max-session-age))))
    (mt/with-dynamic-redefs [env/env (assoc env/env :max-session-age nil)]
      (is (= "20160"
             (config/config-str :max-session-age))))))
