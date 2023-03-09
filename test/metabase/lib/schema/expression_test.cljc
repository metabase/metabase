(ns metabase.lib.schema.expression-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.filter :as filter]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel integer-literal-test
  (testing "valid schemas"
    (are [n] (are [schema] (mc/validate schema n)
               ::expression/integer
               ::expression/number
               ::expression/orderable
               ::expression/equality-comparable
               ::expression/expression)
      (int 1)
      (long 1)
      ;; TODO
      #_(bigint 1)))
  (testing "invalid schemas"
    (are [n] (are [schema] (not (mc/validate schema n))
               ;; sanity check
               ::filter/filter
               ::expression/boolean
               ::expression/string
               ::expression/date
               ::expression/time
               ::expression/date-time
               ::expression/temporal)
      (int 1)
      (long 1)
      ;; TODO
      #_(bigint 1))))

(deftest ^:parallel integer-expression-test
  (let [venues-price [:field {:lib/uuid (str (random-uuid)), :base-type :type/Integer} (meta/id :venues :price)]]
    (testing "A `:field` clause with an integer base type in its options should be considered to be an integer expression"
      (is (mc/validate
           ::expression/integer
           venues-price)))
    (testing "integer literals are integer expressions"
      (is (mc/validate
           ::expression/integer
           2)))
    (testing "Multiplication with all integer args should be considered to be an integer expression"
      (are [schema] (mc/validate
                     schema
                     [:* {:lib/uuid (str (random-uuid))} venues-price 2])
        ::expression/*.integer
        ::expression/integer))
    (testing "Multiplication with one or more non-integer args should NOT be considered to be an integer expression."
      (is (not (mc/validate
                ::expression/integer
                [:* {} venues-price 2.0]))))))
