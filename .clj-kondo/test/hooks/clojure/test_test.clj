(ns hooks.clojure.test-test
  (:require
   [clj-kondo.hooks-api :as api]
   [clj-kondo.impl.utils]
   [clojure.edn :as edn]
   [clojure.test :refer :all]
   [hooks.clojure.test]))

(set! *warn-on-reflection* true)

(defn- deftest-warnings
  [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/disallow-hardcoded-driver-names-in-tests {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.test/deftest {:node   (api/parse-string form)
                                 :config {:linters
                                          {:metabase/disallow-hardcoded-driver-names-in-tests
                                           {:drivers
                                            #{:athena}}}}})
    (mapv :message @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:parallel disallow-hardcoded-driver-names-in-tests-test
  (is (= []
         (deftest-warnings
           "(mt/test-drivers (mt/normal-drivers)
              (do-something))")))
  (is (= ["Do not hardcode driver name :athena in driver tests! [:metabase/disallow-hardcoded-driver-names-in-tests]"]
         (deftest-warnings
           "(mt/test-drivers (mt/normal-drivers)
              (when-not (= driver/*driver* :athena)
                (do-something)))")))
  (testing "make sure :clj-kondo/ignore is propagated correctly"
    (is (= []
           (deftest-warnings
             "(mt/test-drivers (mt/normal-drivers)
                #_{:clj-kondo/ignore [:metabase/disallow-hardcoded-driver-names-in-tests]}
                (when-not (= driver/*driver* :athena)
                  (do-something)))")))))

(defn- use-fixtures-warnings
  [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/validate-deftest {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.test/use-fixtures {:node   (api/parse-string form)
                                      :config {:linters
                                               {:metabase/validate-deftest
                                                {:parallel/unsafe #{'clojure.core/with-redefs}
                                                 :parallel/safe   #{'clojure.core/reset!}}}}})
    (mapv :message @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:parallel use-fixtures-each-checks-thread-safety-test
  (testing ":each fixture with unsafe form produces warning"
    (is (= ["clojure.core/with-redefs is not allowed inside a ^:parallel test or test fixture [:metabase/validate-deftest]"]
           (use-fixtures-warnings
             "(use-fixtures :each (fn [thunk] (clojure.core/with-redefs [foo bar] (thunk))))")))))

(deftest ^:parallel use-fixtures-once-skips-thread-safety-test
  (testing ":once fixture with unsafe form produces no warning"
    (is (= []
           (use-fixtures-warnings
             "(use-fixtures :once (fn [thunk] (clojure.core/with-redefs [foo bar] (thunk))))")))))

(deftest ^:parallel use-fixtures-each-safe-forms-test
  (testing ":each fixture with safe forms produces no warning"
    (is (= []
           (use-fixtures-warnings
             "(use-fixtures :each (fn [thunk] (clojure.core/reset! my-atom 0) (thunk)))")))))

(deftest ^:parallel use-fixtures-each-bang-suffix-not-in-safe-list-test
  (testing ":each fixture with !-suffixed function not in safe list produces warning"
    (is (= ["destructive functions like some.ns/mutate! are not allowed inside a ^:parallel test or test fixture. If this should be allowed, add it to the whitelist in the Kondo config file [:metabase/validate-deftest]"]
           (use-fixtures-warnings
             "(use-fixtures :each (fn [thunk] (some.ns/mutate! x) (thunk)))")))))

(deftest ^:parallel use-fixtures-no-args-test
  (testing "use-fixtures with no args does not crash"
    (is (= []
           (use-fixtures-warnings
             "(use-fixtures)")))))

(defn- deftest-validate-warnings
  "Returns warnings from the validate-deftest linter (not the deftest-not-marked-parallel-or-synchronized linter)."
  [form]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/validate-deftest {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (hooks.clojure.test/deftest {:node   (api/parse-string form)
                                 :config {:linters
                                          {:metabase/validate-deftest
                                           {:parallel/unsafe #{'clojure.core/with-redefs}
                                            :parallel/safe   #{'clojure.core/reset!}}}}})
    (->> @(:findings clj-kondo.impl.utils/*ctx*)
         (filter #(= :metabase/validate-deftest (:type %)))
         (mapv :message))))

(deftest ^:parallel suggest-parallel-for-unmarked-safe-test
  (testing "unmarked test with no unsafe forms suggests ^:parallel"
    (is (= ["Test does not contain any thread-unsafe forms and should be marked ^:parallel"]
           (deftest-validate-warnings
             "(deftest my-test (is (= 1 1)))")))))

(deftest ^:parallel no-suggestion-for-unmarked-unsafe-test
  (testing "unmarked test with unsafe forms gets no validate-deftest warning"
    (is (= []
           (deftest-validate-warnings
             "(deftest my-test (clojure.core/with-redefs [foo bar] (is (= 1 1))))")))))

(deftest ^:parallel no-suggestion-for-unmarked-bang-suffix-test
  (testing "unmarked test with !-suffixed function not in safe list gets no suggestion"
    (is (= []
           (deftest-validate-warnings
             "(deftest my-test (some.ns/mutate! x) (is (= 1 1)))")))))

(deftest ^:parallel no-suggestion-for-parallel-test
  (testing "^:parallel test gets no suggestion"
    (is (= []
           (deftest-validate-warnings
             "(deftest ^:parallel my-test (is (= 1 1)))")))))

(deftest ^:parallel no-suggestion-for-synchronized-test
  (testing "^:synchronized test gets no suggestion"
    (is (= []
           (deftest-validate-warnings
             "(deftest ^:synchronized my-test (is (= 1 1)))")))))

(deftest ^:parallel no-suggestion-for-sequential-test
  (testing "^:sequential test gets no suggestion"
    (is (= []
           (deftest-validate-warnings
             "(deftest ^:sequential my-test (is (= 1 1)))")))))

(deftest ^:parallel no-suggestion-for-old-migrations-test
  (testing "^:mb/old-migrations-test test gets no suggestion"
    (is (= []
           (deftest-validate-warnings
             "(deftest ^:mb/old-migrations-test my-test (is (= 1 1)))")))))

(deftest ^:parallel check-driver-keywords-test
  (testing "Make sure we keep hooks.clojure.test/driver-keywords up to date"
    (let [driver-keywords (-> (slurp ".clj-kondo/config.edn")
                              edn/read-string
                              (get-in [:linters :metabase/disallow-hardcoded-driver-names-in-tests :drivers]))
          driver-modules (->> (slurp "modules/drivers/deps.edn")
                              edn/read-string
                              :deps
                              vals
                              (keep (comp keyword :local/root))
                              (into #{}))]
      (doseq [driver driver-modules]
        (is (contains? driver-keywords driver)
            (format "hooks.clojure.test/driver-keywords should contain %s, please add it" driver))))))
