(ns metabase.notification.condition-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.condition :refer [evaluate-expression]]))

#_{:clj-kondo/ignore [:equals-true]}
(deftest evaluate-literal-values-test
  (testing "literal values"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      42 42 {}
      "hello" "hello" {}
      true true {}
      false false {})))

#_{:clj-kondo/ignore [:equals-true]}
(deftest evaluate-logical-operators-test
  (testing "logical operators"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      ;; and
      true ["and" true true] {}
      false ["and" true false] {}
      false ["and" false false] {}
      true ["and" true true true] {}
      false ["and" true true false] {}

      ;; or
      true ["or" true false] {}
      true ["or" false true] {}
      false ["or" false false] {}
      true ["or" false false true] {}

      ;; not
      false ["not" true] {}
      true ["not" false] {}
      false ["not" ["not" false]] {})))

#_{:clj-kondo/ignore [:equals-true]}
(deftest evaluate-comparison-operators-test
  (testing "comparison operators"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      ;; =
      true ["=" 1 1] {}
      false ["=" 1 2] {}
      true ["=" "a" "a"] {}
      false ["=" "a" "b"] {}
      true ["=" 1 1 1] {}
      false ["=" 1 1 2] {}

      ;; !=
      false ["!=" 1 1] {}
      true ["!=" 1 2] {}
      false ["!=" "a" "a"] {}
      true ["!=" "a" "b"] {}

      ;; >
      true [">" 2 1] {}
      false [">" 1 2] {}
      false [">" 2 2] {}
      true [">" 3 2 1] {}
      false [">" 3 2 2] {}

      ;; <
      false ["<" 2 1] {}
      true ["<" 1 2] {}
      false ["<" 2 2] {}
      true ["<" 1 2 3] {}
      false ["<" 1 2 2] {}

      ;; >=
      true [">=" 2 1] {}
      false [">=" 1 2] {}
      true [">=" 2 2] {}
      true [">=" 3 2 1] {}
      true [">=" 3 2 2] {}
      false [">=" 3 3 4] {}

      ;; <=
      false ["<=" 2 1] {}
      true ["<=" 1 2] {}
      true ["<=" 2 2] {}
      true ["<=" 1 2 3] {}
      true ["<=" 1 2 2] {}
      false ["<=" 2 1 1] {})))

#_{:clj-kondo/ignore [:equals-true]}
(deftest evaluate-context-access-test
  (testing "context access"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      1       ["context" "user_id"]   {:user_id 1}
      "bob"   ["context" "name"]      {:name "bob"}
      "bob"   ["context" "name"]      {"name" "bob"}
      42      ["context" "user" "id"] {:user {:id 42}}
      [1 2 3] ["context" "rows"]      {:rows [1 2 3]}
      nil     ["context" "missing"]   {})))

(deftest evaluate-functions-test
  (testing "functions"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      ;; count
      3 ["count" ["context" "rows"]] {:rows [1 2 3]}
      0 ["count" ["context" "empty"]] {:empty []}
      0 ["count" ["context" "missing"]] {}

      ;; min
      1 ["min" 1 2 3] {}
      1 ["min" 3 2 1] {}
      4 ["min" ["context" "a"] ["context" "b"]] {:a 4, :b 6}

      ;; max
      3 ["max" 1 2 3] {}
      3 ["max" 3 2 1] {}
      6 ["max" ["context" "a"] ["context" "b"]] {:a 4, :b 6})))

#_{:clj-kondo/ignore [:equals-true]}
(deftest evaluate-nested-expressions-test
  (testing "nested expressions"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      true ["and"
            [">" ["count" ["context" "rows"]] 0]
            ["=" ["context" "user_id"] 1]]
      {:user_id 1, :rows [1 2 3 4]}

      false ["and"
             [">" ["count" ["context" "rows"]] 0]
             ["=" ["context" "user_id"] 2]]
      {:user_id 1, :rows [1 2 3 4]}

      false ["and"
             [">" ["count" ["context" "rows"]] 5]
             ["=" ["context" "user_id"] 1]]
      {:user_id 1, :rows [1 2 3 4]}

      true ["or"
            ["=" ["context" "status"] "active"]
            [">" ["context" "score"] 90]]
      {:status "inactive", :score 95}

      false ["or"
             ["=" ["context" "status"] "active"]
             [">" ["context" "score"] 90]]
      {:status "inactive", :score 85})))
