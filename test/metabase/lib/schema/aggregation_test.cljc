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
