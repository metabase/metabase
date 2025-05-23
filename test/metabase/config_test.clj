(ns metabase.config-test
  (:require
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase.config.core :as config]))

(deftest config-parsing
  (testing "takes value of non-empty env var"
    (with-redefs [env/env (assoc env/env :max-session-age "123")]
      (is (= "123"
             (config/config-str :max-session-age)))))
  (testing "falls back to default if env var is nil or an empty string"
    (with-redefs [env/env (assoc env/env :max-session-age "")]
      (is (= "20160"
             (config/config-str :max-session-age))))
    (with-redefs [env/env (assoc env/env :max-session-age nil)]
      (is (= "20160"
             (config/config-str :max-session-age))))))

(deftest ^:parallel build-type-case-test
  (testing "Make sure [[config/build-type-case]] works correctly for Clojure."
    (is (= :dev
           (config/build-type-case
            :dev     :dev
            :release :release)))
    (is (= :clj/dev
           (config/build-type-case
            :clj/dev  :clj/dev
            :cljs/dev :cljs/dev
            :release  :release)))))
