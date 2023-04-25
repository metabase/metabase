(ns metabase.lib.schema.literal-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.literal :as literal]))

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

(deftest ^:parallel string-literal-type-of-test
  (is (mc/validate ::literal/string.datetime "2023-03-08T03:18"))
  (are [s expected] (= expected
                       (expression/type-of s))
    ""                       :type/Text
    "abc"                    :type/Text
    "2023"                   :type/Text
    "2023-03-08"             #{:type/Text :type/Date}
    "03:18"                  #{:type/Text :type/Time}
    "2023-03-08T03:18"       #{:type/Text :type/DateTime}
    "2023-03-08T03:18-07:00" #{:type/Text :type/DateTime}))

(deftest ^:parallel string-literal-test
  (testing "valid schemas"
    (are [schema] (mc/validate schema "s")
      ::expression/string
      ::expression/orderable
      ::expression/equality-comparable
      ::expression/expression))
  (testing "invalid schemas"
    (are [schema] (mc/explain schema "s")
      ::expression/boolean
      ::expression/integer
      ::expression/number
      ::expression/date
      ::expression/time
      ::expression/datetime
      ::expression/temporal)))

(deftest ^:parallel value-test
  ;; we're using (not (me/humanize (mc/explain ...))) here rather than `(mc/validate ...)` because it makes test
  ;; failures much easier to debug.
  (are [clause schema] (not (me/humanize (mc/explain schema clause)))
    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Text} nil]
    :mbql.clause/value

    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Text} nil]
    ::expression/string

    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Float} nil]
    ::expression/number

    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Float} nil]
    ::expression/non-integer-real

    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Float} 1.0]
    :mbql.clause/value

    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Float} 1.0]
    ::expression/number

    ;; the schema doesn't actually need to validate that the type of its argument makes any sense, I guess the QP can
    ;; do that. Just go by the type information.
    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Number} "Not a number"]
    :mbql.clause/value

    [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Number} "Not a number"]
    ::expression/number

    #?@(:clj
        ([:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Number} (Object.)]
         :mbql.clause/value

         [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Number} (Object.)]
         ::expression/number))))

(deftest ^:parallel invalid-value-test
  (testing "invalid :value clauses"
    (testing "not enough args"
      (is (me/humanize
           (mc/explain :mbql.clause/value
                       [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Text}]))))
    (testing "too many args"
      (is (me/humanize
           (mc/explain :mbql.clause/value
                       [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Text} 1 2]))))
    (testing "missing `:effective-type`"
      (is (me/humanize
           (mc/explain :mbql.clause/value
                       [:value {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]))))))

(deftest ^:parallel type-of-value-test
  (testing "should not validate against different type"
    (are [clause schema] (me/humanize (mc/explain schema clause))
      [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Text} nil]
      ::expression/number

      [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Float} nil]
      ::expression/string

      ;; look at the `:effective-type` and/or `:effective-type`, not the wrapped literal type.
      [:value {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Number} "Not a number"]
      ::expression/string)))
