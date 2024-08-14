(ns metabase.lib.schema.aggregation-test
  (:require
   [clojure.test :refer [are deftest testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema]))

(comment metabase.lib.schema/keep-me)

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

(deftest ^:parallel arithmetic-expression-test
  (testing "valid"
    (are [clause] (not (me/humanize (mc/explain :metabase.lib.schema.aggregation/aggregation clause)))
      ;; DIY average
      [:/ {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:sum {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]]
       [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
      ;; Count, but rounded
      [:round {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
      ;; Estimated monthly count based on month-to-date
      [:round {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:* {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        ;; Daily rate
        [:/ {:lib/uuid "00000000-0000-0000-0000-000000000000"}
         [:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]
         [:get-day {:lib/uuid "00000000-0000-0000-0000-000000000000"}
          [:now {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]]
        ;; Times 30 days
        30]]
      [:/ {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:sum {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]]
       [:offset
        {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        [:sum {:lib/uuid "00000000-0000-0000-0000-000000000000"}
         [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]]
        -1]]))
  (testing "invalid - no aggregation inside"
    (are [clause] (me/humanize (mc/explain :metabase.lib.schema.aggregation/aggregation clause))
      [:get-day {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:now {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]
      [:+ {:lib/uuid "00000000-0000-0000-0000-000000000000"} 7 8]
      ;; And the big example from above, but with the count swapped for a field.
      [:round {:lib/uuid "00000000-0000-0000-0000-000000000000"}
       [:* {:lib/uuid "00000000-0000-0000-0000-000000000000"}
        ;; Daily rate
        [:/ {:lib/uuid "00000000-0000-0000-0000-000000000000"}
         [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 12]
         [:get-day {:lib/uuid "00000000-0000-0000-0000-000000000000"}
          [:now {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]]
        ;; Times 30 days
        30]])))

(deftest ^:parallel offset-test
  (let [sum    [:sum {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                [:field {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Float} 1]]
        offset [:offset
                {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                [:sum {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                 [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]]
                -1]]
    (doseq [[x y] [#_[sum offset]
                   [offset sum]]
            :let  [ag [:/ {:lib/uuid "00000000-0000-0000-0000-000000000000"} x y]]]
      (testing (pr-str ag)
        (are [schema x] (not (me/humanize (mc/explain schema x)))
          :metabase.lib.schema.expression/number        ag
          :metabase.lib.schema.aggregation/aggregation  ag
          :metabase.lib.schema.aggregation/aggregations [ag])))))
