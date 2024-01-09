(ns metabase.util.malli.fn-skip-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.config :as config]
   [metabase.util.malli.fn :as mu.fn]))

(deftest checks-happen-iff-skip-ns-decision-fn-returns-true
  ;; `f` will always be enforced, because it was compiled before we changed anything
  (let [f (mu.fn/fn :- :string [] 3)]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid output" (f)))
    (binding [mu.fn/*skip-ns-decision-fn* (constantly true)]
      (let [g (mu.fn/fn :- :string [] 3)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid output" (f)))
        (is (= 3 (g)))))))

(deftest checks-happen-in-not-prod
  (let [original-nts @mu.fn/namespaces-toskip
        _ (reset! mu.fn/namespaces-toskip #{*ns*})
        f (mu.fn/fn :- :string [] 3)]
    (try
      (is (false? config/is-prod?) "Testing is not prod")
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid output" (f))
          "The current namespace is added to namespaces-toskip, however we are not in prod (which is a requirement for the skipping to occur).")
      (finally
        (reset! mu.fn/namespaces-toskip original-nts)))))

(deftest checks-happen-in-prod-when-not-skipped-ns
  (with-redefs [config/is-prod? true]
    (let [original-nts @mu.fn/namespaces-toskip
          _ (reset! mu.fn/namespaces-toskip #{})
          f (mu.fn/fn :- :string [] 3)]
      (try
        (is (true? config/is-prod?) "Testing that `config/is-prod?` is on.")
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid output" (f))
            "The current namespace is not added to namespaces-toskip, so even though we are in prod, no skips occur.")
        (finally
          (reset! mu.fn/namespaces-toskip original-nts))))))

(deftest checks-dont-happen-when-prod-and-skipped-ns
  (with-redefs [config/is-prod? true]
    (let [original-nts @mu.fn/namespaces-toskip
          _ (reset! mu.fn/namespaces-toskip #{*ns*})
          f (mu.fn/fn :- :string [] 3)]
      (try
        (is (true? config/is-prod?) "Testing that `config/is-prod?` is on.")
        (is (= 3 (f)) "f should be 3 since we didn't check the `:string` fn-output schema.")
        (finally
          (reset! mu.fn/namespaces-toskip original-nts))))))

(comment

  (clojure.test/run-tests)

  )
