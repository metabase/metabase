(ns metabase.explorations.query-plan.mbql-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.explorations.query-plan.mbql :as qp.mbql]))

(deftest ^:parallel target-field-id-test
  (testing "an id-based :field ref yields its Field id"
    (are [target] (= 12 (qp.mbql/target-field-id target))
      ["field" {"base-type" "type/Integer"} 12]
      [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 12]))
  (testing "targets that carry no Field id yield nil"
    (are [target] (nil? (qp.mbql/target-field-id target))
      ["field" {"base-type" "type/Text"} "NAME"]
      ["expression" "Foo"]
      nil))
  (testing "targets are read back from JSON at rest, so a malformed one must yield nil, not throw"
    (are [target] (nil? (qp.mbql/target-field-id target))
      ["field" {} nil]
      ["field" {}]
      {}
      "garbage")))

(deftest ^:parallel normalize-target-ref-test
  (testing "a legacy :expression target keeps its name (it is normalized by the lib ref schema)"
    (is (= [:expression "Foo"]
           (let [[tag _opts nm] (qp.mbql/normalize-target-ref ["expression" "Foo"])]
             [tag nm])))))
