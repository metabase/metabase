(ns metabase.lib.schema.aggregation-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.util.malli.registry :as mr]))

(comment metabase.lib.schema/keep-me)

(deftest ^:parallel percentile-test
  (testing "valid"
    (are [clause] (not (me/humanize (mr/explain :mbql.clause/percentile clause)))
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
    (binding [lib.schema.expression/*suppress-expression-type-check?* false]
      (are [clause] (me/humanize (mr/explain :mbql.clause/percentile clause))
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
         0.5]))))

(deftest ^:parallel arithmetic-expression-test
  (testing "valid"
    (are [clause] (not (me/humanize (mr/explain ::lib.schema.aggregation/aggregation clause)))
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
    (are [clause] (me/humanize (mr/explain ::lib.schema.aggregation/aggregation clause))
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
        (are [schema x] (not (me/humanize (mr/explain schema x)))
          ::lib.schema.expression/number        ag
          ::lib.schema.aggregation/aggregation  ag
          ::lib.schema.aggregation/aggregations [ag])))))

(deftest ^:parallel case-and-if-should-be-considered-valid-aggregations-test
  (doseq [clause [:if :case]]
    (testing (str clause " should be allowed as an aggregation expression if it contains an aggregation")
      (let [expr [:if
                  {:lib/uuid "9cbbbcf5-6861-4cf2-8509-a531e53d01a8"}
                  [[[:=
                     {:lib/uuid "56deb1b8-5bea-4c26-9bbc-6f7d2787ea73"}
                     [:field
                      {:base-type :type/Float, :lib/uuid "8bd17b68-8b66-4d63-abde-5d73377e3173"}
                      781]
                     0]
                    0]]
                  [:/
                   {:lib/uuid "96c97774-74b1-4e20-8df5-5a23ae7c9a07"}
                   [:+
                    {:lib/uuid "9ee6e40e-5882-4b80-bac7-8d83a71498f4"}
                    [:sum-where
                     {:lib/uuid "41fa466e-d61e-40b1-b213-5e2e25a6586e"}
                     [:field
                      {:base-type :type/Float, :lib/uuid "6004e6ce-a6b0-4205-b018-a967c91e1582"}
                      755]
                     [:=
                      {:lib/uuid "de25f409-3982-4e24-a4d5-bbc6f739adc5"}
                      [:expression {:base-type :type/Boolean, :lib/uuid "742fcdce-9b3b-48ed-ae93-72a48560b32f"} "Refund"]
                      true]]
                    1]
                   [:+
                    {:lib/uuid "6d83c61c-55ed-4444-9a04-77bc20608de4"}
                    [:sum-where
                     {:lib/uuid "94dae912-8d9a-405d-aef4-f3686fd156c8"}
                     [:field
                      {:base-type :type/Float, :lib/uuid "2e3d5468-1633-4ec3-beeb-521f5fb2be80"}
                      781]
                     [:=
                      {:lib/uuid "3c117b80-4e0e-4305-89d3-6a9dd6a51871"}
                      [:expression {:base-type :type/Boolean, :lib/uuid "5f460efe-d0b3-4d09-ba85-29724fab6fee"} "Paid"]
                      true]]
                    1]]]]
        (is (mr/validate ::lib.schema.aggregation/aggregation expr))))))
