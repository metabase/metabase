(ns metabase.driver.quack.review-test
  "Regression coverage for the review fixes applied when this driver was
  imported in-tree. The type-map and conn-spec tests below are pure — they
  need Metabase on the classpath but no Quack server."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.quack]
   [metabase.driver.quack.conn :as quack.conn]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; DuckDB type-map prefix ordering (data-type->base-type is private)
;;; ---------------------------------------------------------------------------
;; `data-type->base-type` lowercases then returns the first prefix the name
;; starts with. `interval` starts with `int`, so the map MUST list `interval`
;; before the integer family or intervals are mis-typed as :type/Integer.
(deftest ^:parallel interval-maps-to-wildcard-not-integer-test
  (testing "\"interval\" is not caught by the \"int\" prefix (prefix ordering)"
    (is (= :type/* (@#'metabase.driver.quack/data-type->base-type "interval")))
    (is (= :type/* (@#'metabase.driver.quack/data-type->base-type "INTERVAL"))))
  (testing "the integer family still maps correctly"
    (is (= :type/Integer    (@#'metabase.driver.quack/data-type->base-type "int")))
    (is (= :type/Integer    (@#'metabase.driver.quack/data-type->base-type "integer")))
    (is (= :type/BigInteger (@#'metabase.driver.quack/data-type->base-type "bigint")))))

(deftest ^:parallel unsigned-integer-types-test
  (testing "DuckDB unsigned integer types map to Integer/BigInteger"
    (is (= :type/Integer    (@#'metabase.driver.quack/data-type->base-type "utinyint")))
    (is (= :type/Integer    (@#'metabase.driver.quack/data-type->base-type "usmallint")))
    ;; UINTEGER (0..4294967295) overflows signed 32-bit → BigInteger.
    (is (= :type/BigInteger (@#'metabase.driver.quack/data-type->base-type "uinteger")))
    (is (= :type/BigInteger (@#'metabase.driver.quack/data-type->base-type "ubigint")))
    (is (= :type/BigInteger (@#'metabase.driver.quack/data-type->base-type "uhugeint")))))

;;; ---------------------------------------------------------------------------
;;; conn-spec timeout is no longer overloaded onto :max-temporal-export-lag
;;; ---------------------------------------------------------------------------
(deftest ^:parallel conn-spec-timeout-not-overloaded-test
  (testing "details->conn-spec ignores :max-temporal-export-lag for the HTTP timeout"
    (is (= 60 (:timeout-seconds (quack.conn/details->conn-spec {})))
        "defaults to 60s when nothing is set")
    (is (= 30 (:timeout-seconds (quack.conn/details->conn-spec {:timeout-seconds 30})))
        "honors an explicit :timeout-seconds")
    (is (= 60 (:timeout-seconds (quack.conn/details->conn-spec {:max-temporal-export-lag 5})))
        ":max-temporal-export-lag is a different contract and must not set the timeout")))
