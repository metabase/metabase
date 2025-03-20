(ns metabase.query-processor.middleware.large-int-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.middleware.large-int :as large-int]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def min-long -9007199254740991)
(def max-long 9007199254740991)
(def min-long-minus-1 (dec min-long))
(def max-long-plus-1 (inc max-long))

(defn- convert-large-int-to-string [cols rows]
  (qp.store/with-metadata-provider (mt/id)
    (let [query    {:middleware {:js-int-to-string? true}}
          metadata {:cols cols}
          rff      (large-int/convert-large-int-to-string query (constantly conj))
          rf       (rff metadata)]
      (transduce identity rf rows))))

(deftest ^:parallel different-column-types-test
  (testing "Should not convert non-numeric column values"
    (let [cols [{:base_type :type/Text}
                {:base_type :type/Boolean}]
          rows [["Widget" true]]]
      (is (= rows
             (convert-large-int-to-string cols rows)))))
  (testing "Should not convert integers within the JS number range or float/double values"
    (let [cols [{:base_type :type/Integer}
                {:base_type :type/Float}
                {:base_type :type/BigInteger}
                {:base_type :type/BigInteger}
                {:base_type :type/Decimal}]
          rows [[min-long Double/MIN_VALUE (bigint min-long) (biginteger min-long) (bigdec min-long)]
                [max-long Double/MAX_VALUE (bigint max-long) (biginteger max-long) (bigdec max-long)]]]
      (is (= rows
             (convert-large-int-to-string cols rows)))))
  (testing "Should convert integers outside the JS number range"
    (let [cols [{:base_type :type/Integer}
                {:base_type :type/BigInteger}
                {:base_type :type/BigInteger}
                {:base_type :type/Decimal}]
          rows [[min-long-minus-1 (bigint min-long-minus-1) (biginteger min-long-minus-1) (bigdec min-long-minus-1)]
                [max-long-plus-1 (bigint max-long-plus-1) (biginteger max-long-plus-1) (bigdec max-long-plus-1)]]]
      (is (= [(repeat 4 (str min-long-minus-1))
              (repeat 4 (str max-long-plus-1))]
             (convert-large-int-to-string cols rows))))))

(deftest ^:parallel different-row-types-test
  (testing "Middleware should work regardless of the type of each row (#13475)"
    (let [cols [{:base_type :type/Integer}]
          rows  [[1]
                 [max-long-plus-1]
                 (list 1)
                 (cons 1 nil)
                 (cons max-long-plus-1 nil)
                 (lazy-seq [1])
                 (lazy-seq [max-long-plus-1])]]
      (is (= [[1]
              [(str max-long-plus-1)]
              [1]
              [1]
              [(str max-long-plus-1)]
              [1]
              [(str max-long-plus-1)]]
             (convert-large-int-to-string cols rows))))))

(deftest ^:parallel null-ids-as-strings
  (testing "Middleware should convert NULL to nil (#13957)"
    (let [cols [{:base_type :type/Integer}]
          rows [[1]
                [max-long-plus-1]
                [nil]]]
      (is (= [[1]
              [(str max-long-plus-1)]
              [nil]]
             (convert-large-int-to-string cols rows))))))
