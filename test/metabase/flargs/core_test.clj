(ns metabase.flargs.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.classloader.core :as classloader]
   [metabase.flargs.core :as flargs]))

;;; -------------------------------------------------- 1.1 Registry --------------------------------------------------

(deftest register-mapping!-sets-value-test
  (testing "register-mapping! associates values with a function name"
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        (flargs/register-mapping! 'some.ns/foo {:default :a-default})
        (is (= {'some.ns/foo {:default :a-default}} @registry))))))

(deftest register-mapping!-merges-test
  (testing "A second call to register-mapping! merges new keys into the existing map"
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        (flargs/register-mapping! 'some.ns/foo {:default :a-default})
        (flargs/register-mapping! 'some.ns/foo {:impl :an-impl :flarg :flarg/name})
        (is (= {'some.ns/foo {:default :a-default
                              :impl    :an-impl
                              :flarg   :flarg/name}}
               @registry))))))

(deftest register-mapping!-isolates-keys-test
  (testing "Different function names are stored as separate entries"
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        (flargs/register-mapping! 'some.ns/foo {:default :foo-default})
        (flargs/register-mapping! 'some.ns/bar {:default :bar-default})
        (is (= {'some.ns/foo {:default :foo-default}
                'some.ns/bar {:default :bar-default}}
               @registry))))))

;;; ------------------------------------------------- 1.2 Dispatcher -------------------------------------------------

(deftest dispatcher-only-default-test
  (testing "With only a default registered, the dispatcher calls the default"
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        (flargs/register-mapping! 'some.ns/only-default
                                  {:default (fn [x] [:default x])})
        (let [f (flargs/dynamic-flarg-fn 'some.ns 'some.ns/only-default)]
          (is (= [:default 42] (f 42))))))))

(deftest dispatcher-with-impl-test
  (testing "With an impl registered, the dispatcher calls the impl"
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        (flargs/register-mapping! 'some.ns/with-impl
                                  {:default (fn [x] [:default x])
                                   :impl    (fn [x] [:impl x])})
        (let [f (flargs/dynamic-flarg-fn 'some.ns 'some.ns/with-impl)]
          (is (= [:impl 42] (f 42))))))))

(deftest dispatcher-preserves-varargs-test
  (testing "The dispatcher forwards all args (including varargs) to the selected fn"
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        (flargs/register-mapping! 'some.ns/varargs-default
                                  {:default (fn [& args] [:default args])})
        (flargs/register-mapping! 'some.ns/varargs-impl
                                  {:default (fn [& _] :ignored)
                                   :impl    (fn [& args] [:impl args])})
        (let [f-default (flargs/dynamic-flarg-fn 'some.ns 'some.ns/varargs-default)
              f-impl    (flargs/dynamic-flarg-fn 'some.ns 'some.ns/varargs-impl)]
          (is (= [:default '(1 2 3)] (f-default 1 2 3)))
          (is (= [:impl    '(:a :b)] (f-impl :a :b))))))))

(deftest dispatcher-preserves-return-value-test
  (testing "The dispatcher returns whatever the underlying fn returns (including nil)"
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        (flargs/register-mapping! 'some.ns/returns-nil
                                  {:default (fn [_] nil)})
        (flargs/register-mapping! 'some.ns/returns-map
                                  {:default (fn [_] :ignored)
                                   :impl    (fn [_] {:ok true})})
        (let [f-nil (flargs/dynamic-flarg-fn 'some.ns 'some.ns/returns-nil)
              f-map (flargs/dynamic-flarg-fn 'some.ns 'some.ns/returns-map)]
          (is (nil? (f-nil :anything)))
          (is (= {:ok true} (f-map :anything))))))))

;;; ------------------------------------------------ 1.3 Lazy require ------------------------------------------------

(deftest lazy-require-called-exactly-once-test
  (testing "classloader/require is called exactly once across many invocations"
    (let [registry   (atom {})
          call-count (atom 0)]
      (with-redefs [flargs/registry     registry
                    classloader/require (fn [& _] (swap! call-count inc))]
        (flargs/register-mapping! 'some.ns/lazy {:default (fn [x] x)})
        (let [f (flargs/dynamic-flarg-fn 'some.ns 'some.ns/lazy)]
          (dotimes [_ 5] (f :x))
          (is (= 1 @call-count)))))))

(deftest lazy-require-failure-uses-default-test
  (testing "If classloader/require throws, the default is still used (exception is swallowed)"
    (let [registry (atom {})]
      (with-redefs [flargs/registry     registry
                    classloader/require (fn [& _] (throw (ex-info "boom" {})))]
        (flargs/register-mapping! 'some.ns/boom {:default (fn [x] [:default x])})
        (let [f (flargs/dynamic-flarg-fn 'some.ns 'some.ns/boom)]
          (is (= [:default :ok] (f :ok))))))))

;;; -------------------------------------------------- 1.4 Macro -----------------------------------------------------

(deftest ^:parallel macro-requires-docstring-test
  (testing "defflarg without a docstring throws a compile-time exception"
    (is (thrown? Exception
                 (macroexpand
                  '(metabase.flargs.core/defflarg foo
                     :flarg/foo
                     metabase.flarg.foo.core
                     [x]
                     x))))))

(deftest ^:parallel macro-requires-literal-keyword-flarg-test
  (testing "defflarg requires a literal keyword whose namespace is 'flarg'"
    (is (thrown-with-msg? Exception #"(?i)flarg"
                          (macroexpand
                           '(metabase.flargs.core/defflarg foo
                              "docstring"
                              :foo ; not namespaced
                              metabase.flarg.foo.core
                              [x]
                              x))))
    (is (thrown-with-msg? Exception #"(?i)flarg"
                          (macroexpand
                           '(metabase.flargs.core/defflarg foo
                              "docstring"
                              :other/foo ; wrong namespace
                              metabase.flarg.foo.core
                              [x]
                              x))))
    (is (thrown? Exception
                 (macroexpand
                  '(metabase.flargs.core/defflarg foo
                     "docstring"
                     "not-a-keyword"
                     metabase.flarg.foo.core
                     [x]
                     x))))))

(deftest ^:parallel macro-requires-symbol-flarg-ns-test
  (testing "defflarg requires the flarg-ns argument to be a symbol"
    (is (thrown? Exception
                 (macroexpand
                  '(metabase.flargs.core/defflarg foo
                     "docstring"
                     :flarg/foo
                     "not-a-symbol"
                     [x]
                     x))))))

(deftest ^:parallel macro-requires-vector-arglist-test
  (testing "defflarg requires the arglist to be a vector"
    (is (thrown? Exception
                 (macroexpand
                  '(metabase.flargs.core/defflarg foo
                     "docstring"
                     :flarg/foo
                     metabase.flarg.foo.core
                     (x) ; a list, not a vector
                     x))))))

;;; ---------------------------------------------- 1.5 Integration ---------------------------------------------------

(deftest in-process-integration-test
  (testing "A defflarg whose flarg namespace exists uses the impl; one whose flarg namespace does not exist uses the default"
    ;; Reset the registry for a clean slate. Use a fresh atom so we don't stomp any shared state.
    (let [registry (atom {})]
      (with-redefs [flargs/registry registry]
        ;; "Main side" ns: not prefixed with metabase.flarg. or metabase-enterprise.flarg.
        (let [main-ns (create-ns 'metabase.flargs.core-test.fake-main)]
          (binding [*ns* main-ns]
            (refer-clojure)
            (require '[metabase.flargs.core :as flargs])
            (eval '(flargs/defflarg impl-will-load
                     "Will be overridden by the flarg-side impl."
                     :flarg/integration-test
                     metabase.flarg.integration-test.impl
                     [x]
                     [:default x]))
            (eval '(flargs/defflarg impl-missing
                     "Flarg ns does not exist, so default wins."
                     :flarg/missing
                     metabase.flarg.integration-test.nope.does.not.exist
                     [x]
                     [:default-only x]))))
        ;; "Flarg side" ns: prefixed with metabase.flarg.
        (let [flarg-ns (create-ns 'metabase.flarg.integration-test.impl)]
          (binding [*ns* flarg-ns]
            (refer-clojure)
            (require '[metabase.flargs.core :as flargs])
            (eval '(flargs/defflarg impl-will-load
                     "Impl used when flarg is on."
                     :flarg/integration-test
                     metabase.flarg.integration-test.impl
                     [x]
                     [:impl x]))))
        (is (= [:impl :hello]
               ((resolve 'metabase.flargs.core-test.fake-main/impl-will-load) :hello))
            "When a matching flarg-side impl is registered, it runs instead of the default")
        (is (= [:default-only :hello]
               ((resolve 'metabase.flargs.core-test.fake-main/impl-missing) :hello))
            "When the flarg ns cannot be loaded, the default runs")))))
