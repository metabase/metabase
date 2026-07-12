(ns metabase.startup.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.startup.core :as startup]))

;; Standalone multimethods so the tests exercise run-startup-logic! in isolation from whatever
;; validations and logic the rest of the app has globally registered, and independent of iteration order.
(defmulti ^:private isolated-validation! keyword)
(defmulti ^:private isolated-logic! keyword)

(deftest run-startup-logic-test
  (testing "a throwing validation aborts before any startup logic runs"
    (remove-all-methods isolated-validation!)
    (remove-all-methods isolated-logic!)
    (let [logic-ran? (atom false)]
      (defmethod isolated-validation! ::boom [_] (throw (ex-info "boom" {})))
      (defmethod isolated-logic! ::should-not-run [_] (reset! logic-ran? true))
      (with-redefs [startup/def-startup-validation! isolated-validation!
                    startup/def-startup-logic!      isolated-logic!]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom" (startup/run-startup-logic!)))
        (is (false? @logic-ran?) "startup logic must not run once a validation has failed"))))
  (testing "a throwing startup-logic method is swallowed and later logic still runs"
    (remove-all-methods isolated-validation!)
    (remove-all-methods isolated-logic!)
    (let [ran? (atom false)]
      (defmethod isolated-logic! ::throws [_] (throw (ex-info "kaboom" {})))
      (defmethod isolated-logic! ::runs [_] (reset! ran? true))
      (with-redefs [startup/def-startup-validation! isolated-validation!
                    startup/def-startup-logic!      isolated-logic!]
        (is (nil? (startup/run-startup-logic!)))
        (is (true? @ran?) "a swallowed logic error must not prevent the remaining logic from running")))))
