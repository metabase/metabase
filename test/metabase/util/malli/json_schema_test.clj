(ns metabase.util.malli.json-schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli :as mu]
   [metabase.util.malli.json-schema :as mu.json-schema]
   [metabase.util.malli.registry :as mr]))

(mr/def ::two-or-more-strings
  [:repeat {:min 2} :string])

(deftest ^:parallel sequence-schema-test
  (testing "fixed items become required prefix items"
    (is (= {:type "array" :prefixItems [{:type "integer"} {:type "string"}] :items false :minItems 2 :maxItems 2}
           (mu.json-schema/transform [:cat :int :string]))))
  (testing "trailing repetition becomes items with its minimum count"
    (is (= {:type "array" :prefixItems [{:type "integer"}] :items {:type "string"} :minItems 3}
           (mu.json-schema/transform [:catn [:n :int] [:names [:repeat {:min 2} :string]]]))))
  (testing "optional trailing items are allowed but not required"
    (is (= {:type "array" :prefixItems [{:type "integer"} {:type "string"}] :items false :minItems 1 :maxItems 2}
           (mu.json-schema/transform [:cat :int [:? :string]]))))
  (testing "sequences registered by keyword are spliced in, as malli does"
    (is (= {:type "array" :prefixItems [{:type "integer"}] :items {:type "string"} :minItems 3}
           (dissoc (mu.json-schema/transform [:cat :int ::two-or-more-strings]) :definitions))))
  (testing "sequences wrapped in :schema stay nested"
    (is (= {:type "array" :prefixItems [{:type "integer"} {:type "array" :items {:type "string"} :minItems 0}]
            :items false :minItems 2 :maxItems 2}
           (mu.json-schema/transform [:cat :int [:schema [:* :string]]]))))
  (testing "repeated sequences cannot be spelled, so only the leading items are checked"
    (is (= {:type "array" :prefixItems [{:type "integer"}] :minItems 1}
           (mu.json-schema/transform [:cat :int [:+ [:cat :string :int]]]))))
  (testing "unexpressible sequences check only their leading items"
    (is (= {:type "array" :prefixItems [{:type "integer"}] :minItems 1}
           (mu.json-schema/transform [:cat :int [:* :string] :int])))))

(deftest ^:parallel any-of-test
  (testing "overlapping branches pass when any of them does, like malli's"
    (is (= {:anyOf [{:type "string" :format "uuid"} {:type "string" :minLength 1}]}
           (mu.json-schema/transform [:multi {:dispatch uuid?} [true :uuid] [false [:string {:min 1}]]])))))

(deftest ^:parallel tuple-test
  (testing "every tuple item is required"
    (is (= {:type "array" :prefixItems [{:type "integer"} {:type "string"}] :items false :minItems 2}
           (mu.json-schema/transform [:tuple :int :string])))))

(deftest ^:parallel property-names-test
  (testing "properties named like JSON Schema keywords keep their schemas"
    (is (= {:type "object"
            :properties {"pattern" {:type "string"} "required" {:type "integer"}}
            :required ["pattern" "required"]}
           (mu.json-schema/transform [:map [:pattern :string] [:required :int]])))))

(deftest ^:parallel definition-name-test
  (testing "definition names hold only characters JSON Pointers allow"
    (mr/def ::<=> :int)
    (let [schema (mu.json-schema/transform [:ref ::<=>])]
      (is (= {:$ref "#/definitions/metabase.util.malli.json-schema-test._LT__EQ__GT_"} (dissoc schema :definitions)))
      (is (= {"metabase.util.malli.json-schema-test._LT__EQ__GT_" {:type "integer"}} (:definitions schema))))))

(deftest ^:parallel dispatch-on-tag-test
  (let [schema (mu.json-schema/dispatch-on-tag
                (mu.json-schema/transform [:or [:tuple [:= "a"] :int] [:tuple [:= "b"] :string]]))]
    (testing "tagged branches are checked only for their own tag"
      (is (= {:allOf [{:type "array" :minItems 1 :prefixItems [{:enum ["a" "b"]}]}
                      {:if {:type "array" :prefixItems [{:const "a"}]} :then {:type "array" :prefixItems [{:const "a"} {:type "integer"}] :items false :minItems 2}}
                      {:if {:type "array" :prefixItems [{:const "b"}]} :then {:type "array" :prefixItems [{:const "b"} {:type "string"}] :items false :minItems 2}}]}
             schema)))))

(deftest ^:parallel empty-schema-test
  (testing "schemas that compile to a JSON Schema accepting anything must say so"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"accepts anything"
                          (mu.json-schema/transform [:fn odd?])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"accepts anything"
                          (mu.json-schema/transform [:or :int [:fn odd?]])))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"accepts anything"
                          (mu.json-schema/transform [:map [:n [:fn odd?]]]))))
  (testing "a :json-schema property says what the schema accepts"
    (is (= {:type "integer"} (mu.json-schema/transform [:fn {:json-schema {:type "integer"}} odd?]))))
  (testing "refinements of a schema with a shape only narrow it"
    (is (= {:type "integer"} (mu.json-schema/transform [:and :int [:fn odd?]]))))
  (testing ":any accepts anything on purpose"
    (is (= {} (mu.json-schema/transform :any)))
    (is (= {:type "array" :items {}} (mu.json-schema/transform [:sequential :any]))))
  (testing ":some accepts anything but null"
    (is (= {:not {:type "null"}} (mu.json-schema/transform :some)))))

(deftest ^:parallel never-test
  (testing "never accepts nothing"
    (is (= {:type "object" :properties {"n" {:not {}}} :required ["n"]}
           (mu.json-schema/transform [:map [:n (mu/never)]]))))
  (testing "alternatives that accept nothing are dropped"
    (is (= {:type "integer"} (mu.json-schema/transform [:or :int (mu/never)])))))
