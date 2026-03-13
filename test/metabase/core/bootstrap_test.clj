(ns metabase.core.bootstrap-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]))

(set! *warn-on-reflection* true)

(deftest ^:parallel log4j2-resource-namespaced-test
  (testing "log4j2.xml is loaded from metabase/ subdirectory to avoid classpath conflicts"
    (let [url (io/resource "metabase/log4j2.xml")]
      (is (some? url) "Resource should exist at metabase/log4j2.xml"))))

(deftest ^:parallel log4j2-test-resource-namespaced-test
  (testing "log4j2-test.xml is loaded from metabase/ subdirectory to avoid classpath conflicts"
    (let [url (io/resource "metabase/log4j2-test.xml")]
      (is (some? url) "Resource should exist at metabase/log4j2-test.xml"))))
