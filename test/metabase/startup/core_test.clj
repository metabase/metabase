(ns metabase.startup.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.startup.core :as startup]))

(deftest run-startup-logic-test
  (let [ran   (atom [])
        rec   (fn [k] [k (fn [_] (swap! ran conj k))])
        boom  (fn [k] [k (fn [_] (throw (ex-info "boom" {})))])]
    (testing "a throwing validation aborts before any logic runs"
      (reset! ran [])
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                            (#'startup/run-startup-logic!* [(rec ::v1) (boom ::v2)] [(rec ::l1)])))
      (is (= [::v1] @ran) "the validation before the throw ran; no logic ran"))
    (testing "validations run before logic, and a throwing logic impl is swallowed"
      (reset! ran [])
      (is (nil? (#'startup/run-startup-logic!* [(rec ::v1)] [(rec ::l1) (boom ::l2) (rec ::l3)])))
      (is (= [::v1 ::l1 ::l3] @ran) "validation first, then logic; the throwing logic impl did not stop the rest"))))
