(ns metabase.lib.schema.expression-test
  (:require
   [clojure.test :refer [are deftest testing]]
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]))

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
      #?@(:clj ((bigint 1)
                (biginteger 1)))))
  (testing "invalid schemas"
    (are [n] (are [schema] (mc/explain schema n)
               ::expression/boolean
               ::expression/string
               ::expression/date
               ::expression/time
               ::expression/datetime
               ::expression/temporal)
      (int 1)
      (long 1)
      #?@(:clj ((bigint 1)
                (biginteger 1))))))
