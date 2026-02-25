#_{:clj-kondo/ignore [:metabase/unknown-release-flag :metabase/non-literal-release-flag]}
(ns metabase.release-flags.guard-test
  (:require
   [clojure.test :refer :all]
   [metabase.release-flags.guard :as guard]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- setup-guard-ns!
  "Creates a temporary namespace with a function and guards it. Returns [ns-sym fn-var]."
  [flag-name]
  (let [ns-sym (symbol (str "metabase.release-flags.guard-test-" (gensym)))]
    (create-ns ns-sym)
    (intern ns-sym 'test-fn (fn [] :original-value))
    #_{:clj-kondo/ignore [:metabase/non-literal-release-flag]}
    (guard/guard-namespace! flag-name (the-ns ns-sym))
    [ns-sym (ns-resolve (the-ns ns-sym) 'test-fn)]))

(defn- teardown-guard-ns! [ns-sym]
  (remove-ns ns-sym))

(deftest guard-namespace-blocks-when-disabled-test
  (let [[ns-sym test-fn-var] (setup-guard-ns! "guard-test-flag")]
    (try
      (testing "guarded function returns nil when flag does not exist"
        (is (nil? (test-fn-var))))
      (finally
        (teardown-guard-ns! ns-sym)))))

(deftest guard-namespace-allows-when-enabled-test
  (let [[ns-sym test-fn-var] (setup-guard-ns! "guard-enabled-flag")]
    (try
      (mt/with-temp [:model/ReleaseFlag _ {:flag "guard-enabled-flag" :description "Test" :start_date "2026-01-01" :is_enabled true}]
        (testing "guarded function runs normally when flag is enabled"
          (is (= :original-value (test-fn-var)))))
      (finally
        (teardown-guard-ns! ns-sym)))))

(deftest guard-records-blocked-calls-test
  (let [[ns-sym test-fn-var] (setup-guard-ns! "blocked-test-flag")]
    (try
      (testing "blocked calls are recorded in *blocked-calls* when bound"
        (binding [guard/*blocked-calls* (atom [])]
          (test-fn-var)
          (let [calls @guard/*blocked-calls*]
            (is (= 1 (count calls)))
            (is (= "blocked-test-flag" (:flag (first calls))))
            (is (string? (:fn (first calls))))
            (is (string? (:call-site (first calls)))))))
      (testing "blocked calls are not recorded when *blocked-calls* is nil"
        (is (nil? (test-fn-var))))
      (finally
        (teardown-guard-ns! ns-sym)))))

(deftest bypass-guard-fixture-test
  (let [[ns-sym test-fn-var] (setup-guard-ns! "bypass-test-flag")]
    (try
      (testing "bypassed flag allows function to run"
        (binding [guard/*bypass-guard* #{"bypass-test-flag"}]
          (is (= :original-value (test-fn-var)))))
      (testing "non-bypassed flag still blocks"
        (binding [guard/*bypass-guard* #{"some-other-flag"}]
          (is (nil? (test-fn-var)))))
      (testing "bypass-guard-fixture returns a working fixture"
        (let [fixture #_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
              (guard/bypass-guard-fixture :bypass-test-flag)]
          (fixture (fn []
                     (is (= :original-value (test-fn-var)))))))
      (finally
        (teardown-guard-ns! ns-sym)))))

(deftest guard-namespace-with-explicit-ns-test
  (testing "guard-namespace! accepts an explicit namespace argument"
    (let [ns-sym (symbol (str "metabase.release-flags.guard-test-explicit-" (gensym)))]
      (create-ns ns-sym)
      (intern ns-sym 'explicit-fn (fn [] :explicit-value))
      (try
        #_{:clj-kondo/ignore [:metabase/unknown-release-flag]}
        (guard/guard-namespace! "explicit-flag" (the-ns ns-sym))
        (let [v (ns-resolve (the-ns ns-sym) 'explicit-fn)]
          (testing "function is guarded"
            (is (nil? (v))))
          (testing "bypass works"
            (binding [guard/*bypass-guard* #{"explicit-flag"}]
              (is (= :explicit-value (v))))))
        (finally
          (remove-ns ns-sym))))))
