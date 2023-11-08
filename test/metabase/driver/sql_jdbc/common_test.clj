(ns metabase.driver.sql-jdbc.common-test
  (:require [clojure.test :as t]
            [metabase.driver.sql-jdbc.common :as sql-jdbc.common]))

(t/deftest conn-str-with-additional-opts-testc
  (t/testing "conn-str-with-additional-opts combined with additional-opts->string works as expected"
    (doseq [[exp-str sep-style conn-str opts] [["localhost:4321" :comma "localhost:4321" nil]
                                               ["localhost:4321" :comma "localhost:4321" {}]
                                               ["localhost:4321,a=1" :comma "localhost:4321" {:a 1}]
                                               ["localhost:4321,a=1,b=2" :comma "localhost:4321" {:a 1 :b 2}]
                                               ["localhost:4321" :semicolon "localhost:4321" nil]
                                               ["localhost:4321" :semicolon "localhost:4321" {}]
                                               ["localhost:4321;a=1" :semicolon "localhost:4321" {:a 1}]
                                               ["localhost:4321;a=1;b=2" :semicolon "localhost:4321" {:a 1 :b 2}]
                                               ["localhost:4321" :url "localhost:4321" nil]
                                               ["localhost:4321" :url "localhost:4321" {}]
                                               ["localhost:4321?a=1" :url "localhost:4321" {:a 1}]
                                               ["localhost:4321?a=1&b=2" :url "localhost:4321" {:a 1 :b 2}]]]
      (let [opts-str (sql-jdbc.common/additional-opts->string sep-style opts)]
        (t/is (= exp-str (sql-jdbc.common/conn-str-with-additional-opts conn-str sep-style opts-str)))))))
