(ns metabase.util.malli.typescript.type-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli.typescript.type :as type]))

(deftest ^:parallel precedence-test
  (testing "arrays parenthesize union and intersection elements"
    (is (= "(\"asc\" | \"desc\")[]"
           (type/render (type/array (type/union [(type/literal "asc")
                                                 (type/literal "desc")])))))
    (is (= "(string | null)[]"
           (type/render (type/array (type/union [(type/primitive "string")
                                                 (type/primitive "null")])))))
    (is (= "(A & B)[]"
           (type/render (type/array (type/intersection [(type/raw "A")
                                                        (type/raw "B")]))))))
  (testing "tuple rest elements are always array types"
    (is (= "[string, ...(number | null)[]]"
           (type/render
            (type/tuple [(type/primitive "string")]
                        (type/union [(type/primitive "number")
                                     (type/primitive "null")]))))))
  (testing "generic arguments preserve nested structure"
    (is (= "Promise<(string | null)[]>"
           (type/render
            (type/generic "Promise"
                          [(type/array
                            (type/union [(type/primitive "string")
                                         (type/primitive "null")]))])))))
  (testing "supported literal nodes are always valid TypeScript"
    (are [expected value] (= expected (type/render (type/literal value)))
      "\"x\"" \x
      "true" true
      "false" false
      "null" nil
      "42" 42))
  (testing "unsupported literal nodes fail before invalid TypeScript can be emitted"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Unsupported TypeScript literal"
                          (type/render (type/literal 'not-a-typescript-literal)))))
  (testing "type predicates narrow parameters"
    (is (= "(x: unknown) => x is string"
           (type/render (type/function-predicate
                         (type/function-type [{:name "x", :type (type/unknown)}]
                                             (type/primitive "boolean"))
                         0
                         (type/primitive "string")))))))

(deftest ^:parallel readonly-and-raw-precedence-test
  (testing "readonly containers"
    (are [expected node] (= expected (type/render node))
      "readonly string[]"
      (assoc (type/array (type/primitive "string")) :readonly? true)

      "readonly [string, number]"
      (assoc (type/tuple [(type/primitive "string") (type/primitive "number")]) :readonly? true)

      "Readonly<{\n\tx: string;\n}>"
      (assoc (type/object [{:name "x", :type (type/primitive "string")}]) :readonly? true)

      "ReadonlySet<string>"
      (assoc (type/generic "Set" [(type/primitive "string")]) :readonly? true)

      "Readonly<Record<string, number>>"
      (assoc (type/generic "Record" [(type/primitive "string") (type/primitive "number")]) :readonly? true)))
  (testing "raw compound types are parenthesized in precedence-sensitive positions"
    (are [expected node] (= expected (type/render node))
      "(string|number)[]"
      (type/array (type/raw "string|number"))

      "(A&B)[]"
      (type/array (type/raw "A&B"))

      "((value: string)=>number)[]"
      (type/array (type/raw "(value: string)=>number"))

      "Promise<(string|number)[]>"
      (type/generic "Promise" [(type/array (type/raw "string|number"))])

      "[...(string|number)[]]"
      (type/tuple [] (type/raw "string|number")))))

(deftest ^:parallel simplification-and-key-transform-test
  (testing "key-transform helper node"
    (let [node (type/key-transform-type
                "Camel"
                (type/object [{:name "\"display-name\"", :type (type/primitive "string")}]))]
      (is (true? (type/uses-key-transform? node)))
      (is (false? (type/uses-key-transform? (type/literal "Camel<foo>"))))
      (is (= "Camel<{\n\t\"display-name\": string;\n}>"
             (type/render node)))
      (is (= "Shared.Camel<{\n\t\"display-name\": string;\n}>"
             (type/render node {:key-transform-name #(str "Shared." %)})))))
  (testing "never and unknown simplification in unions and intersections"
    (is (= "string"
           (type/render (type/union [(type/primitive "string")
                                     (type/raw "never")]))))
    (is (= "never"
           (type/render (type/union [(type/raw "never")
                                     (type/primitive "never")]))))
    (is (= "never"
           (type/render (type/intersection [(type/primitive "string")
                                            (type/raw "never")]))))
    (is (= "\"drill-thru/pk\""
           (type/render (type/union [(type/literal "drill-thru/pk")
                                     (type/intersection [(type/literal "metabase.lib.drill-thru/drill-thru")
                                                         (type/raw "never")])]))))
    (is (= "string"
           (type/render (type/intersection [(type/primitive "string")
                                            (type/unknown)]))))
    (is (= "unknown"
           (type/render (type/intersection [(type/unknown)
                                            (type/unknown)]))))))
