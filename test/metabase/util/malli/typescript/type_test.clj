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
                          (type/render (type/literal 'not-a-typescript-literal))))))
