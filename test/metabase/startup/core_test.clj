(ns metabase.startup.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.startup.core :as startup]))

(deftest validations-run-before-logic-and-abort-test
  (testing "a throwing startup validation aborts before any startup logic runs"
    (let [logic-ran? (atom false)]
      (try
        (defmethod startup/def-startup-validation! ::boom [_]
          (throw (ex-info "boom" {})))
        (defmethod startup/def-startup-logic! ::should-not-run [_]
          (reset! logic-ran? true))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom" (startup/run-startup-logic!)))
        (is (false? @logic-ran?) "startup logic must not run once a validation has failed")
        (finally
          (remove-method startup/def-startup-validation! ::boom)
          (remove-method startup/def-startup-logic! ::should-not-run))))))
