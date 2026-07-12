(ns metabase.startup.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.startup.core :as startup]))

(defn- impls
  "Three startup impls that record their dispatch value into `ran`, with a throwing one in the middle.
  Ordered so assertions are deterministic."
  [ran]
  [[::a    (fn [_] (swap! ran conj ::a))]
   [::boom (fn [_] (throw (ex-info "boom" {})))]
   [::c    (fn [_] (swap! ran conj ::c))]])

(deftest run-impl-test
  (testing "abort-on-error? — a throw propagates, stopping the loop (used for validations)"
    (let [ran (atom [])]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                            (doseq [[k f] (impls ran)] (#'startup/run-impl! k f true))))
      (is (= [::a] @ran) "nothing after the throwing impl runs")))
  (testing "not abort-on-error? — a throw is logged and the loop continues (used for logic)"
    (let [ran (atom [])]
      (doseq [[k f] (impls ran)] (#'startup/run-impl! k f false))
      (is (= [::a ::c] @ran) "the impl after the throwing one still runs"))))
