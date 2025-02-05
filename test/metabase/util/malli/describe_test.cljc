(ns metabase.util.malli.describe-test
  "Additional tests for this live in [[metabase.util.malli-test]]."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.util.malli.describe :as umd]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel correct-string-length-descriptions-test
  (testing "Work around upstream issue https://github.com/metosin/malli/issues/924"
    (are [schema expected] (= expected
                              (umd/describe schema))
      [:string {:min 5}] "string with length >= 5"
      [:string {:max 5}] "string with length <= 5")))

(mr/def ::card-type*
  [:enum :question :metric :model])

(mr/def ::card-type
  ::card-type*)

(deftest ^:parallel describe-registry-schema-test
  (testing "describe should work for schemas in our registry (#46799)"
    (is (= "nullable enum of :question, :metric, :model"
           (umd/describe [:maybe ::card-type])))
    (is (= "nullable enum of :question, :metric, :model"
           (umd/describe [:maybe [:ref ::card-type]])))))

(mr/def ::positive-int*
  [:int {:min 0}])

(mr/def ::positive-int
  [:schema
   {:description "value must be an integer greater than zero."}
   ::positive-int*])

(deftest ^:parallel preserve-resolved-descriptions-test
  (are [schema] (= "value must be an integer greater than zero."
                   (umd/describe schema))
    ::positive-int
    [:ref ::positive-int]
    [:schema ::positive-int])
  (let [PositiveInt [:schema
                     {:description "value must be an integer greater than zero."}
                     ::positive-int*]]
    (is (= "value must be an integer greater than zero."
           (umd/describe PositiveInt)))))

(mr/def ::cons
  [:maybe [:tuple any? [:ref ::cons]]])

(mr/def ::map
  [:map
   [:k keyword?]
   [:parent {:optional true} [:ref ::map]]])

(deftest ^:parallel handle-circular-refs-test
  (is (mr/validate ::cons [1 [2 [3 nil]]]))
  (is (= "nullable vector with exactly 2 items of type: anything, recursive :metabase.util.malli.describe-test/cons"
         (umd/describe ::cons)))
  (is (mr/validate ::map {:k :child, :parent {:k :parent}}))
  (is (= "map where {:k -> <keyword>, :parent (optional) -> <recursive :metabase.util.malli.describe-test/map>}"
         (umd/describe ::map))))
