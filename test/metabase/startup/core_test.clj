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

(deftest run-startup-logic-passes-phases-in-order-test
  (testing "run-startup-logic! passes the validation methods to the abort slot and logic to the swallow slot"
    (let [captured (atom nil)]
      (try
        ;; probe impls, distinct per phase so a swapped call is detectable; never invoked (the runner is stubbed)
        (defmethod startup/def-startup-validation! ::probe-validation [_])
        (defmethod startup/def-startup-logic! ::probe-logic [_])
        (with-redefs [startup/run-startup-logic!* (fn [validation-impls setup-impls]
                                                    (reset! captured [validation-impls setup-impls]))]
          (startup/run-startup-logic!))
        (let [[validation-impls setup-impls] @captured]
          (is (contains? validation-impls ::probe-validation) "validation methods go to the first (abort) arg")
          (is (contains? setup-impls ::probe-logic) "logic methods go to the second (swallow) arg")
          (is (not (contains? validation-impls ::probe-logic)) "the two phases are not swapped"))
        (finally
          (remove-method startup/def-startup-validation! ::probe-validation)
          (remove-method startup/def-startup-logic! ::probe-logic))))))
