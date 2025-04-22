(ns metabase.notification.condition-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.condition :refer [evaluate-expression]]))

(deftest evaluate-literal-values-test
  (testing "literal values"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      42 42 {}
      "hello" "hello" {}
      true true {}
      false false {})))

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

(deftest evaluate-context-access-test
  (testing "context access"
    (are [expected expression context] (= expected (evaluate-expression expression context))
      1 ["context" "user_id"] {:user_id 1}
      "bob" ["context" "name"] {:name "bob"}
      42 ["context" "user" "id"] {:user {:id 42}}
      [1 2 3] ["context" "rows"] {:rows [1 2 3]}
      nil ["context" "missing"] {})))

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

(deftest evaluate-collection-predicate-operators-test
  (testing "collection predicate operators"
    (testing "with each item is an atom"
      (let [numbers-context {:numbers [1 2 3 4 5]}]

        (testing ":every operator"
          (is (true? (evaluate-expression ["every" [">" ["this"] 0] ["context" "numbers"]] numbers-context))
              "every number is greater than 0")
          (is (false? (evaluate-expression ["every" [">" ["this"] 3] ["context" "numbers"]] numbers-context))
              "not every number is greater than 3"))

        (testing ":some operator"
          (is (true? (evaluate-expression ["some" ["=" ["this"] 3] ["context" "numbers"]] numbers-context))
              "some number equals 3")
          (is (not (evaluate-expression ["some" ["=" ["this"] 10] ["context" "numbers"]] numbers-context))
              "no number equals 10"))

        (testing ":none operator"
          (is (true? (evaluate-expression ["none" ["<" ["this"] 0] ["context" "numbers"]] numbers-context))
              "none of the numbers is less than 0")
          (is (false? (evaluate-expression ["none" [">" ["this"] 2] ["context" "numbers"]] numbers-context))
              "some numbers are greater than 2"))))
    (testing "with each item is a map"
      (let [objects-context {:items [{:value 10} {:value 20} {:value 30}]}]

        (testing ":every operator"

          (is (true? (evaluate-expression ["every" [">" ["this" "value"] 5] ["context" "items"]] objects-context))
              "every object has value greater than 5")
          (is (false? (evaluate-expression ["every" [">" ["this" "value"] 15] ["context" "items"]] objects-context))
              "not every object has value greater than 15"))

        (testing ":some operator"
          (is (true? (evaluate-expression ["some" ["=" ["this" "value"] 20] ["context" "items"]] objects-context))
              "some object has value equal to 20")
          (is (not (evaluate-expression ["some" ["=" ["this" "value"] 50] ["context" "items"]] objects-context))
              "no object has value equal to 50"))

        (testing ":none operator"
          (is (true? (evaluate-expression ["none" [">" ["this" "value"] 50] ["context" "items"]] objects-context))
              "none of the objects has value greater than 50")
          (is (false? (evaluate-expression ["none" ["<" ["this" "value"] 20] ["context" "items"]] objects-context))
              "some objects have value less than 20"))))))
