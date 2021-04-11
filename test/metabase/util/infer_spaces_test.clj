(ns metabase.util.infer-spaces-test
  (:require [clojure.test :refer :all]
            [metabase.util.infer-spaces :as infer-spaces]))

(deftest infer-spaces-test
  (doseq [[input expected] {"user"                      ["user"]
                            "users"                     ["users"]
                            "orders"                    ["orders"]
                            "products"                  ["products"]
                            "events"                    ["events"]
                            "checkins"                  ["checkins"]
                            "dashboardcardsubscription" ["dashboard" "card" "subscription"]}]
    (testing (pr-str (list 'infer-spaces input))
      (is (= expected
             (infer-spaces/infer-spaces input))))))
