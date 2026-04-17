(ns metabase.flargs.init-test
  "Unit tests for the env-var → flarg activation wiring. These tests mock the environment and the
  classloader require side so they don't touch the real process env or the real classpath."
  (:require
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.flargs.init :as flargs.init]))

;;; ----------------------------------------- enabled-flargs (pure) -----------------------------------------

(deftest ^:parallel enabled-flargs-empty-env-test
  (testing "With no env vars at all, returns an empty set"
    (is (= #{} (flargs.init/enabled-flargs {})))))

(deftest ^:parallel enabled-flargs-no-rf-vars-test
  (testing "Non-RF_ env vars are ignored"
    (is (= #{} (flargs.init/enabled-flargs {"PATH"          "/usr/bin"
                                            "HOME"          "/home/me"
                                            "METABASE_FOO"  "true"
                                            "RFOO"          "true" ; missing underscore
                                            "rf_lower"      "true"}))))) ; lowercase rf_

(deftest ^:parallel enabled-flargs-single-truthy-test
  (testing "A single truthy RF_ var produces a single :flarg/* keyword"
    (is (= #{:flarg/foo} (flargs.init/enabled-flargs {"RF_FOO" "true"})))))

(deftest ^:parallel enabled-flargs-multi-segment-name-test
  (testing "Underscores in the flarg name become dashes in the keyword"
    (is (= #{:flarg/foo-bar-baz}
           (flargs.init/enabled-flargs {"RF_FOO_BAR_BAZ" "true"})))))

(deftest ^:parallel enabled-flargs-truthy-values-test
  (testing "Case-insensitive, whitespace-trimmed 'true' is truthy; everything else is falsy"
    (are [v enabled?] (= (if enabled? #{:flarg/x} #{})
                         (flargs.init/enabled-flargs {"RF_X" v}))
      "true"   true
      "TRUE"   true
      "True"   true
      " true " true
      "false"  false
      "False"  false
      "0"      false
      "1"      false   ; only the literal string "true" counts
      "yes"    false
      ""       false
      " "      false)))

(deftest ^:parallel enabled-flargs-nil-value-test
  (testing "A nil value is not truthy"
    (is (= #{} (flargs.init/enabled-flargs {"RF_X" nil})))))

(deftest ^:parallel enabled-flargs-mixed-test
  (testing "A mix of truthy and falsy RF_ vars plus noise yields only the truthy ones"
    (is (= #{:flarg/a :flarg/c}
           (flargs.init/enabled-flargs {"RF_A"         "true"
                                        "RF_B"         "false"
                                        "RF_C"         "TRUE"
                                        "PATH"         "/usr/bin"
                                        "METABASE_FOO" "true"})))))

;;; ------------------------------------- require-flarg-inits! (mockable) -------------------------------------

;; These tests use `with-redefs` to mock `classloader/require`, which the Metabase hawk test
;; runner forbids under `^:parallel`. They're intentionally sequential.
(deftest require-flarg-inits-empty-test
  (testing "With an empty set, classloader/require is not called"
    (let [calls (atom [])]
      (with-redefs [classloader/require (fn [& args] (swap! calls conj args))]
        (flargs.init/require-flarg-inits! #{})
        (is (= [] @calls))))))

(deftest require-flarg-inits-single-test
  (testing "With one flarg, classloader/require is called once with the right init symbol"
    (let [calls (atom [])]
      (with-redefs [classloader/require (fn [& args] (swap! calls conj args))]
        (flargs.init/require-flarg-inits! #{:flarg/my-flarg})
        (is (= [['metabase.flarg.my-flarg.init]] @calls))))))

(deftest require-flarg-inits-multi-test
  (testing "With multiple flargs, classloader/require is called once per flarg"
    (let [calls (atom [])]
      (with-redefs [classloader/require (fn [& args] (swap! calls conj args))]
        (flargs.init/require-flarg-inits! #{:flarg/a :flarg/b :flarg/c})
        (is (= #{['metabase.flarg.a.init]
                 ['metabase.flarg.b.init]
                 ['metabase.flarg.c.init]}
               (set @calls)))
        (is (= 3 (count @calls)))))))

(deftest require-flarg-inits-failure-throws-test
  (testing "A require failure throws ex-info naming the flarg and init-ns with an alias hint"
    (with-redefs [classloader/require (fn [& _] (throw (ex-info "boom" {})))]
      (let [e (try (flargs.init/require-flarg-inits! #{:flarg/broken})
                   nil
                   (catch Exception e e))]
        (is (some? e) "An exception is thrown")
        (is (= :flarg/broken (:flarg (ex-data e))))
        (is (= 'metabase.flarg.broken.init (:init-ns (ex-data e))))
        (is (re-find #"metabase\.flarg\.broken\.init" (ex-message e)))
        (is (re-find #":flarg/broken" (ex-message e)))
        (is (re-find #"-A:flarg/broken" (ex-message e))
            "The error message includes the remediation alias hint")))))

(deftest require-flarg-inits-first-failure-wins-test
  (testing "When a require fails, subsequent flargs are NOT attempted"
    (let [calls       (atom [])
          fail-on-2nd (let [n (atom 0)]
                        (fn [& args]
                          (swap! calls conj args)
                          (when (= 2 (swap! n inc))
                            (throw (ex-info "second call boom" {})))))]
      (with-redefs [classloader/require fail-on-2nd]
        (is (thrown? Exception
                     ;; vector forces iteration order so we can assert which attempts happened
                     (flargs.init/require-flarg-inits! [:flarg/first :flarg/second :flarg/third])))
        (is (= 2 (count @calls))
            "Third flarg was not attempted after the second one failed")
        (is (= [['metabase.flarg.first.init]
                ['metabase.flarg.second.init]]
               @calls))))))

;;; ------------------------------------------ activate! (smoke) ------------------------------------------

(deftest activate!-orchestrates-and-returns-set-test
  (testing "activate! consults enabled-flargs and requires each init, returning the activated set"
    (let [calls (atom [])]
      (with-redefs [flargs.init/enabled-flargs (fn
                                                 ([] #{:flarg/one :flarg/two})
                                                 ([_] #{:flarg/one :flarg/two}))
                    classloader/require        (fn [& args] (swap! calls conj args))]
        (is (= #{:flarg/one :flarg/two} (flargs.init/activate!)))
        (is (= #{['metabase.flarg.one.init]
                 ['metabase.flarg.two.init]}
               (set @calls)))))))

(deftest activate!-empty-no-requires-test
  (testing "When no flargs are enabled, activate! returns an empty set and requires nothing"
    (let [calls (atom [])]
      (with-redefs [flargs.init/enabled-flargs (fn
                                                 ([] #{})
                                                 ([_] #{}))
                    classloader/require        (fn [& args] (swap! calls conj args))]
        (is (= #{} (flargs.init/activate!)))
        (is (= [] @calls))))))

;;; --------------------------- End-to-end (documented, runs via a separate command) ---------------------------

;; A real end-to-end check requires a fresh JVM with both the :flarg/test-flarg deps.edn alias AND
;; the RF_TEST_FLARG env var set so that metabase.flargs.init/activate! requires the
;; metabase.flarg.test-flarg.init namespace, which registers its impl against the flarg registry.
;;
;; Coordinator-runnable command (see metabase.flargs.integration-test for the cached-load rationale):
;;
;;   RF_TEST_FLARG=true clojure -X:dev:ee:ee-dev:test:flarg/test-flarg \
;;     :only '[metabase.flargs.integration-test]'
;;
;; This test namespace deliberately does not attempt it because it would mutate process env and
;; depend on classpath state outside the unit-test harness.
