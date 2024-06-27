(ns metabase.driver.mongo.conversion-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [flatland.ordered.map :as ordered-map]
   [metabase.driver.mongo.conversion :as mongo.conversion]))

(set! *warn-on-reflection* true)

(deftest ^:parallel transformation-test
  (let [m (ordered-map/ordered-map
           :a 1
           :b "x"
           :c {:d "e"})
        ms {"u" "v"
            "x" {"y" "z"}}]
    (testing "Transform map"
      (is (= m
             (-> m mongo.conversion/to-document (mongo.conversion/from-document {:keywordize true}))))
      (is (= ms
             (-> ms mongo.conversion/to-document (mongo.conversion/from-document nil)))))
    (testing "Transform sequence"
      (let [mseqk [m (walk/keywordize-keys ms)]
            mseqs [(walk/stringify-keys m) ms]]
        (is (= mseqk
               (-> mseqk mongo.conversion/to-document (mongo.conversion/from-document {:keywordize true}))))
        (is (= mseqs
               (-> mseqs mongo.conversion/to-document (mongo.conversion/from-document nil))))))))

(deftest bson-negative-zero->big-decimal-test
  (testing "Bson Decimal128 zero is converted to BigDecimal zero"
    (is (= {"negativeZero" 0M}
           (mongo.conversion/from-document
            (org.bson.Document. "negativeZero" org.bson.types.Decimal128/NEGATIVE_ZERO)
            nil)))
    (is (= {"positiveZero" 0M}
           (mongo.conversion/from-document
            (org.bson.Document. "positiveZero" org.bson.types.Decimal128/POSITIVE_ZERO)
            nil)))))
