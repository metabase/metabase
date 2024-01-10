(ns metabase.util.malli.fn-skip-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.malli.fn :as mu.fn]))

(deftest instrumentation-can-be-omitted
  ;; Careful not to use binding for *skip-ns-decision-fn*, because the fn macro will evaluate it before it gets bound!
  (testing "by default, instrumented forms are emitted"
    (let [f (mu.fn/fn :- :int [] "schemas aren't checked if this is returned")]
      (try (f)
           (is false "(f) did not throw")
           (catch Exception e
             (is (=? {:type ::mu.fn/invalid-output} (ex-data e)))))))
  (let [orig (var-get #'mu.fn/*skip-ns-decision-fn*)]
    (testing "when skip-ns-decision-fn returns true, unvalidated form is emitted"
      (try
        (alter-var-root #'mu.fn/*skip-ns-decision-fn* (constantly (fn [_ns] true)))
        ;; we have to use eval here because `mu.fn/fn` is expanded at _read_ time and we want to change the
        ;; expansion via [[*skip-ns-decision-fn*]]. So that's why we call eval here. Could definitely use some
        ;; macroexpansion tests as well.
        (let [f (eval '(mu.fn/fn :- :int [] "schemas aren't checked if this is returned"))]
          (try (f)
               (is (= (f) "schemas aren't checked if this is returned"))
               (catch Exception _e
                 (is false "it threw a schema error"))))
        (finally
          (alter-var-root #'mu.fn/*skip-ns-decision-fn* (constantly orig)))))))
