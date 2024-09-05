(ns metabase.util.malli.describe-test
  "Additional tests for this live in [[metabase.util.malli-test]]."
  (:require
   [clojure.test :refer [are deftest is testing]]
   [metabase.util.malli.describe :as umd]
   [metabase.util.malli.registry :as mr]))

;;; this is only fixed in Clojure

#?(:clj
   (deftest ^:parallel correct-string-length-descriptions-test
     (testing "Work around upstream issue https://github.com/metosin/malli/issues/924"
       (are [schema expected] (= expected
                                 (umd/describe schema))
         [:string {:min 5}] "string with length >= 5"
         [:string {:max 5}] "string with length <= 5"))))

(mr/def ::card-type*
  [:enum :question :metric :model])

(mr/def ::card-type
  ::card-type*)

(deftest ^:parallel describe-registry-schema-test
  (testing "describe should work for schemas in our registry (#46799)"
    (is (= "nullable enum of :question, :metric, :model"
           (umd/describe [:maybe ::card-type])))))

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
