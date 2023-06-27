(ns metabase.lib.schema.aggregation-test
  (:require
   [clojure.test :refer [are deftest testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]))

(comment metabase.lib.schema/keep-me)

;;; See also [[metabase.lib.aggregation-test/type-of-test]]
(deftest ^:parallel sum-type-of-test
  (are [field-ref expected] (= expected
                               (lib.schema.expression/type-of
                                [:sum
                                 {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                                 field-ref]))
    [:field
     {:lib/uuid "00000000-0000-0000-0000-000000000000"}
     1]
    :type/Number

    [:field
     {:lib/uuid "00000000-0000-0000-0000-000000000000", :effective-type :type/Integer}
     1]
    :type/Integer

    [:field
     {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Integer}
     1]
    :type/Integer))

(deftest ^:parallel allow-numeric-expressions-test
  (let [expr [:-
              {:lib/uuid "00000000-0000-0000-0000-000000000000"}
              [:sum
               {:lib/uuid "00000000-0000-0000-0000-000000000000"}
               [:field
                {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                1]]
              2]]
    (are [schema] (not (me/humanize
                        (mc/explain
                         schema
                         expr)))
      ::lib.schema.expression/number
      ::lib.schema.aggregation/aggregation)))

(deftest ^:parallel percentile-test
  (testing "valid"
    (are [clause] (not (me/humanize (mc/explain :mbql.clause/percentile clause)))
      [:percentile
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       2.0
       1.0]

      [:percentile
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       2
       1]

      [:percentile
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
       1.0]

      [:percentile
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
       0.1]))
  (testing "invalid"
    (are [clause] (me/humanize (mc/explain :mbql.clause/percentile clause))
      ;; p > 1
      [:percentile
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
       1.1]

      ;; p < 0
      [:percentile
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
       -1]

      ;; not a number
      [:percentile
       {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Text} 1]
       0.5])))
