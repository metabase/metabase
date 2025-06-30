(ns ^{:instrument/always true} metabase.util.malli.fn-java-error-test
  "Test that reproduces the actual mu/fn Java exception issue in ClojureScript."
  (:require
   [cljs.test :refer [deftest is testing]]
   [metabase.util.malli :as mu]))

(mu/defn- mu-fn-generator :- :int
  []
  (mu/fn []
    (throw (ex-info "Oops." {}))))

(def mu-fn
  (mu-fn-generator))

(mu/defn mu-fn-caller :- :int
  []
  (mu-fn))

(deftest mu-defn-exception-handling-test
  (testing "mu functions do not generate `java.lang.Exception`s"
    (let [result (try
                   (mu-fn-caller)
                   (catch ExceptionInfo _e
                     ::success))]
      (is (= ::success result)))))
