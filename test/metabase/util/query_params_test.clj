(ns metabase.util.query-params-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.util.query-params :as u.qp]))

(deftest ->searchpart-test
  (is (= ["http://example.com/demo" {}]
         (#'u.qp/->searchpart "http://example.com/demo"))
      "can split an empty qp set from url properly")

  (is (= ["http://example.com/demo" {:x "one"}]
         (#'u.qp/->searchpart "http://example.com/demo?x=one"))
      "can split a single qp")

  (is (= ["http://example.com/demo" {:x ["one" "two"]}]
         (#'u.qp/->searchpart "http://example.com/demo?x=one&x=two"))
      "can split 2 qps")

  (is (= ["http://example.com/demo" {(keyword "x ") ;; <-- note spaces here
                                     ["one" "two  "]}] ;; <-- and spaces here
         (#'u.qp/->searchpart "http://example.com/demo?x%20=one&x%20=two%20%20"))
      "can split url encoded qps properly"))


(deftest assoc-qp-test
  (is (= "http://example.com/demo"
         (u.qp/assoc-qp "http://example.com/demo" {}))
      "can add nothing to no query params")

  (is (= "http://example.com/demo?a=1"
         (u.qp/assoc-qp "http://example.com/demo" {:a 1}))
      "can add one qp to no query params")

  (is (= "http://example.com/demo?a=1&a=2"
         (u.qp/assoc-qp "http://example.com/demo" {:a [1 2]}))
      "can add two qp with the same key to no query params")

  (is (= "http://example.com/demo?a=1"
         (u.qp/assoc-qp "http://example.com/demo?a=1" {}))
      "can add nothing to 1 query param")

  (is (= "http://example.com/demo?x=one&y=two"
         (u.qp/assoc-qp "http://example.com/demo?x=one" {:y "two"}))
      "can add a different qp to 1 query param")

  (is (= "http://example.com/demo?x=one&x=two"
         (u.qp/assoc-qp "http://example.com/demo?x=one" {:x "two"}))
      "can add a the same qp to 1 query param")

  (is (= "http://example.com/demo?x%20=one&x%20=two"
         (u.qp/assoc-qp "http://example.com/demo?x%20=one" {(keyword "x ") "two"}))
      "can add a query-encodable key to 1 query param")

  (is (= "http://example.com/demo?x=one%20&x=two%20"
         (u.qp/assoc-qp "http://example.com/demo?x=one%20" {:x "two "}))
      "can add a query-encodable value to 1 query-encodable query param")

  (is (= "jdbc:snowflake//abc.snowflake.com"
         (u.qp/assoc-qp "jdbc:snowflake//abc.snowflake.com" {}))
      "can work on non http base urls"))
