(ns metabase.driver.sql-jdbc.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.common :as sql-jdbc.common]))

(deftest ^:parallel conn-str-with-additional-opts-testc
  (testing "conn-str-with-additional-opts combined with additional-opts->string works as expected"
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
        (is (= exp-str (sql-jdbc.common/conn-str-with-additional-opts conn-str sep-style opts-str)))))))

(deftest ^:parallel additional-options->map-test
  (testing "additional-options->map function works as expected"
    (doseq [[exp addl-opts sep-style nv-sep] [[{"bar" "two"} "bar=two" :url]
                                              [{"bar" "two", "baz" "three"} "bar=two&baz=three" :url]
                                              [{"foo" "one", "bar" "two", "baz" "three"}
                                               "foo=one&bar=two&baz=three"
                                               :url]
                                              [{"foo" "one", "bar" "Two"} "foo=one&BAR=Two" :url]
                                              [{"foo" "one", "bar" nil, "baz" "three"} "foo=one&bar=&baz=three" :url]
                                              [{"foo" "one", "bar" "two", "baz" "three"}
                                               "foo=one,bar=two,baz=three"
                                               :comma]
                                              [{"foo" "one", "bar" "two", "baz" "three"}
                                               "foo=one;BaR=two;baz=three"
                                               :semicolon]]]
      (testing (format "can parse value for %s separator style from %s" sep-style addl-opts)
        (is (= exp (sql-jdbc.common/additional-options->map addl-opts sep-style nv-sep)))))))
