(ns metabase.util.malli.fn-test
  (:require
   [clojure.test :refer :all]
   [clojure.tools.macro :as tools.macro]
   [clojure.walk :as walk]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel add-default-schemas-test
  (are [input expected] (= expected
                           (#'mu.fn/add-default-schemas input))
    []
    []

    '[x]
    '[x]

    '[x :- :int]
    '[x :- :int]

    '[x :- :int y]
    '[x :- :int y]

    '[{:keys [x]}]
    '[{:keys [x]} :- [:maybe :map]]

    '[{:keys [x]} y]
    '[{:keys [x]} :- [:maybe :map] y]

    '[{:keys [x]} :- [:map [:x :int]]]
    '[{:keys [x]} :- [:map [:x :int]]]

    '[{:keys [x]} :- [:map [:x :int]] {:keys [y]}]
    '[{:keys [x]} :- [:map [:x :int]] {:keys [y]} :- [:maybe :map]]

    ;; key-value varargs: add [:* :any]
    '[path opts :- :map & {:keys [token-check?], :or {token-check? true}}]
    '[path opts :- :map & {:keys [token-check?], :or {token-check? true}} :- [:* :any]]

    '[x [_ id-or-name {::keys [source-table]}]]
    '[x [_ id-or-name {::keys [source-table]}] :- [:maybe [:sequential :any]]]

    '[x [_ id-or-name {::keys [source-table]}] :- [:sequential :int]]
    '[x [_ id-or-name {::keys [source-table]}] :- [:sequential :int]]

    '[x & [_ id-or-name {::keys [source-table]}]]
    '[x & [_ id-or-name {::keys [source-table]}] :- [:* :any]]))

(deftest ^:parallel fn-schema-test
  (is (= [:function
          [:=> :cat :string]
          [:=> [:cat :any] :string]
          [:=> [:cat :int [:maybe :keyword]] :string]]
         (mu.fn/fn-schema
          (mu.fn/parse-fn-tail
           '(describe-temporal-unit :- :string
                                    ([]
                                     (describe-temporal-unit 1 nil))

                                    ([unit]
                                     (describe-temporal-unit 1 unit))

                                    ([n    :- :int
                                      unit :- [:maybe :keyword]]
                                     (str n \space (or unit :day)))))))))

(deftest ^:parallel instrumented-fn-form-test
  (are [form expected] (= expected
                          (walk/macroexpand-all (mu.fn/instrumented-fn-form {} (mu.fn/parse-fn-tail form))))
    '([x :- :int y])
    '(let*
      [&f
       (fn* ([x y]))
       &schema+explainers
       (metabase.util.malli.fn/fn-schemas->schema+explainers [:=> [:cat :int :any] :any])]
       (fn*
         ([a b]
          (try
            (metabase.util.malli.fn/validate-input
             {}
             (clojure.core/first @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             (clojure.core/second @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             a)
            (&f a b)
            (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))

    '(:- :int [x :- :int y])
    '(let*
      [&f (fn* ([x y]))
       &schema+explainers (metabase.util.malli.fn/fn-schemas->schema+explainers
                           [:=> [:cat :int :any] :int])]
       (fn*
         ([a b]
          (try
            (metabase.util.malli.fn/validate-input
             {}
             (clojure.core/first @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             (clojure.core/second @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             a)
            (metabase.util.malli.fn/validate-output
             {}
             (clojure.core/first @(:out (clojure.core/nth &schema+explainers 0)))
             (clojure.core/second @(:out (clojure.core/nth &schema+explainers 0)))
             (&f a b))
            (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))

    '(:- :int [x :- :int y] (+ x y))
    '(let* [&f (fn* ([x y] (+ x y)))
            &schema+explainers (metabase.util.malli.fn/fn-schemas->schema+explainers
                                [:=> [:cat :int :any] :int])]
       (fn*
         ([a b]
          (try
            (metabase.util.malli.fn/validate-input
             {}
             (clojure.core/first @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             (clojure.core/second @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             a)
            (metabase.util.malli.fn/validate-output
             {}
             (clojure.core/first @(:out (clojure.core/nth &schema+explainers 0)))
             (clojure.core/second @(:out (clojure.core/nth &schema+explainers 0)))
             (&f a b))
            (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))

    '([x :- :int y] {:pre [(int? x)]})
    '(let* [&f (fn* ([x y] {:pre [(int? x)]}))
            &schema+explainers (metabase.util.malli.fn/fn-schemas->schema+explainers
                                [:=> [:cat :int :any] :any])]
       (fn*
         ([a b]
          (try
            (metabase.util.malli.fn/validate-input
             {}
             (clojure.core/first @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             (clojure.core/second @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 0)) 0))
             a)
            (&f a b)
            (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))

    '(:- :int
         ([x] (inc x))
         ([x :- :int y] (+ x y)))
    '(let* [&f (fn* ([x] (inc x)) ([x y] (+ x y)))
            &schema+explainers (metabase.util.malli.fn/fn-schemas->schema+explainers
                                [:function [:=> [:cat :any] :int] [:=> [:cat :int :any] :int]])]
       (fn*
         ([a]
          (try
            (metabase.util.malli.fn/validate-output
             {}
             (clojure.core/first @(:out (clojure.core/nth &schema+explainers 0)))
             (clojure.core/second @(:out (clojure.core/nth &schema+explainers 0)))
             (&f a))
            (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))
         ([a b]
          (try
            (metabase.util.malli.fn/validate-input
             {}
             (clojure.core/first @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 1)) 0))
             (clojure.core/second @(clojure.core/nth (:in (clojure.core/nth &schema+explainers 1)) 0))
             a)
            (metabase.util.malli.fn/validate-output
             {}
             (clojure.core/first @(:out (clojure.core/nth &schema+explainers 1)))
             (clojure.core/second @(:out (clojure.core/nth &schema+explainers 1)))
             (&f a b))
            (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))))

(deftest ^:parallel fn-test
  (let [f (mu.fn/fn :- :int [y] y)]
    (is (= 1
           (f 1)))
    (mu/disable-enforcement
      (is (nil? (f nil))))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid output:.*should be an integer"
         (f nil)))))

(deftest ^:parallel registry-test
  (mr/def ::number :int)
  (is (= 1 ((mu.fn/fn :- ::number [y] y) 1)))
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Invalid output:.*should be an integer"
       ((mu.fn/fn :- ::number [y] y) 1.0)))
  (mr/def ::number double?)
  (is (= 1.0 ((mu.fn/fn :- ::number [y] y) 1.0)))
  (is (thrown-with-msg?
       clojure.lang.ExceptionInfo
       #"Invalid output:.*should be a double"
       ((mu.fn/fn :- ::number [y] y) 1))))

(deftest ^:parallel varargs-test
  (let [form '(metabase.util.malli.fn/fn my-fn
                [path
                 opts :- :map
                 & {:keys [token-check?]
                    :or   {token-check? true}}]
                (merge {:path path, :token-check? token-check?} opts))]
    (is (= '(let* [&f (clojure.core/fn [path opts & {:keys [token-check?], :or {token-check? true}}]
                        (merge {:path path, :token-check? token-check?} opts))
                   &schema+explainers
                   (metabase.util.malli.fn/fn-schemas->schema+explainers
                    [:=> [:cat :any :map [:* :any]] :any])]
              (clojure.core/fn
                ([a b & {:as kvs}]
                 (try (metabase.util.malli.fn/validate-input
                       {:fn-name 'my-fn}
                       (clojure.core/-> &schema+explainers (clojure.core/nth 0) :in
                                        (clojure.core/nth 1) clojure.core/deref clojure.core/first)
                       (clojure.core/-> &schema+explainers (clojure.core/nth 0) :in
                                        (clojure.core/nth 1) clojure.core/deref clojure.core/second)
                       b)
                      (&f a b kvs)
                      (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))
           (macroexpand form)))
    (is (= [:=>
            [:cat :any :map [:* :any]]
            :any]
           (mu.fn/fn-schema (mu.fn/parse-fn-tail (rest form))))))
  (let [f (mu.fn/fn my-fn
            [path
             opts :- :map
             & {:keys [token-check?]
                :or   {token-check? true}}]
            (merge {:path path, :token-check? token-check?} opts))]
    (is (= {:path "path", :token-check? true, :opts true}
           (f "path" {:opts true})))
    (is (= {:path "path", :token-check? false, :opts true}
           (f "path" {:opts true} :token-check? false)))))

(deftest ^:parallel varargs-schema-test
  (testing "Schemas on the varargs should work (#46864)"
    (let [form '(metabase.util.malli.fn/fn my-plus :- :int
                  [x :- :int
                   y :- :int
                   & more :- [:* :int]]
                  (reduce + (list* x y more)))]
      (is (= '(let*
               [&f
                (clojure.core/fn [x y & more] (reduce + (list* x y more)))
                &schema+explainers
                (metabase.util.malli.fn/fn-schemas->schema+explainers [:=> [:cat :int :int [:* :int]] :int])]
                (clojure.core/fn
                  ([a b & more]
                   (try (metabase.util.malli.fn/validate-input
                         {:fn-name 'my-plus}
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                          :in (clojure.core/nth 0) clojure.core/deref clojure.core/first)
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                          :in (clojure.core/nth 0) clojure.core/deref clojure.core/second)
                         a)
                        (metabase.util.malli.fn/validate-input
                         {:fn-name 'my-plus}
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                          :in (clojure.core/nth 1) clojure.core/deref clojure.core/first)
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                          :in (clojure.core/nth 1) clojure.core/deref clojure.core/second)
                         b)
                        (metabase.util.malli.fn/validate-input
                         {:fn-name 'my-plus}
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                          :in (clojure.core/nth 2) clojure.core/deref clojure.core/first)
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                          :in (clojure.core/nth 2) clojure.core/deref clojure.core/second)
                         more)
                        (metabase.util.malli.fn/validate-output
                         {:fn-name 'my-plus}
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0) :out clojure.core/deref clojure.core/first)
                         (clojure.core/-> &schema+explainers (clojure.core/nth 0) :out clojure.core/deref clojure.core/second)
                         (clojure.core/apply &f a b more))
                        (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))

             (macroexpand form)))
      (is (= [:=>
              [:cat :int :int [:* :int]]
              :int]
             (mu.fn/fn-schema (mu.fn/parse-fn-tail (rest form))))))
    (let [f (mu.fn/fn my-plus :- :int
              [x :- :int
               y :- :int
               & more :- [:* :int]]
              (reduce + (list* x y more)))]
      (is (= 3
             (f 1 2)))
      (is (= 6
             (f 1 2 3)))
      (is (= 10
             (f 1 2 3 4))))))

(deftest ^:parallel varargs-map-schema-test
  (testing "Schemas on the varargs map should work (#46864)"
    (let [form '(metabase.util.malli.fn/fn my-plus :- :map
                  [x :- :int
                   y :- :int
                   & {:as options} :- [:map [:integer? :boolean]]]
                  {:options options, :output (+ x y)})]
      (is (= '(let*
               [&f
                (clojure.core/fn [x y & {:as options}] {:options options, :output (+ x y)})
                &schema+explainers
                (metabase.util.malli.fn/fn-schemas->schema+explainers [:=> [:cat :int :int [:map [:integer? :boolean]]] :map])]
                (clojure.core/fn
                  ([a b & {:as kvs}]
                   (try
                     (metabase.util.malli.fn/validate-input
                      {:fn-name 'my-plus}
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :in (clojure.core/nth 0) clojure.core/deref clojure.core/first)
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :in (clojure.core/nth 0) clojure.core/deref clojure.core/second)
                      a)
                     (metabase.util.malli.fn/validate-input
                      {:fn-name 'my-plus}
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :in (clojure.core/nth 1) clojure.core/deref clojure.core/first)
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :in (clojure.core/nth 1) clojure.core/deref clojure.core/second)
                      b)
                     (metabase.util.malli.fn/validate-input
                      {:fn-name 'my-plus}
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :in (clojure.core/nth 2) clojure.core/deref clojure.core/first)
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :in (clojure.core/nth 2) clojure.core/deref clojure.core/second)
                      kvs)
                     (metabase.util.malli.fn/validate-output
                      {:fn-name 'my-plus}
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :out clojure.core/deref clojure.core/first)
                      (clojure.core/-> &schema+explainers (clojure.core/nth 0)
                                       :out clojure.core/deref clojure.core/second)
                      (&f a b kvs))
                     (catch java.lang.Exception error (throw (metabase.util.malli.fn/fixup-stacktrace error)))))))

             (macroexpand form)))
      (is (= [:=>
              [:cat :int :int [:* :any]]
              :map]
             (mu.fn/fn-schema (mu.fn/parse-fn-tail (rest form)) {:target :target/metadata}))))
    (let [f (mu.fn/fn my-plus :- :map
              [x :- :int
               y :- :int
               & {:as options} :- [:map [:integer? :boolean]]]
              {:options options, :output (+ x y)})]
      (is (= {:options {:integer? true}, :output 3}
             (f 1 2 :integer? true)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid input:"
           (f 1 2 :integer? 1)))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid input:"
           (f 1 2))))))

(deftest ^:parallel parse-fn-tail-preserve-metadata-test
  (is (= 'Integer
         (-> '(^{:private true} add-ints :- :int ^{:tag Integer} [x :- :int y :- :int] (+ x y))
             mu.fn/parse-fn-tail
             :values
             :arities
             :value
             :values
             :args
             meta
             :tag))))

(mu/defn- foo :- keyword? [_x :- string?] "bad output")
(mu/defn- bar :- keyword?
  ([_x :- string? _y] "bad output")
  ([_x :- string? _y & _xs] "bad output"))

(mu/defn- works? :- keyword? [_x :- string?] :yes)

(defn from-here? [^Exception e]
  (let [top-trace (-> e (.getStackTrace) first)
        cn        (when top-trace
                    (.getClassName ^StackTraceElement top-trace))]
    (when cn
      (is (re-find (re-pattern (munge (namespace `foo))) cn))
      (is (not (re-find #"metabase.util.malli.fn\$validate" cn))))))

(deftest ^:parallel error-location-tests
  (tools.macro/macrolet [(check-error-location [expr]
                           `(try ~expr
                                 (is false "Did not throw")
                                 (catch Exception e# (from-here? e#))))]
    (testing "Top stack trace is this namespace, not in validate"
      (testing "single arity input"
        (check-error-location (foo 1)))
      (testing "single arity output"
        (check-error-location (foo "good input")))
      (testing "multi arity input"
        (check-error-location (bar 1 2)))
      (testing "multi arity output"
        (check-error-location (bar "good input" 2)))
      (testing "var args input"
        (check-error-location (bar 1 2 3 4 5)))
      (testing "var args output"
        (check-error-location (bar "good input" 2 3 4 5))))
    (testing "sanity check-error-location that it works"
      (is (= :yes (works? "valid input"))))))

(deftest instrument-ns-test
  (doseq [mode ["test" "prod" "dev"]]
    (with-redefs [config/is-prod? (= mode "prod")
                  config/is-dev?  (= mode "dev")
                  config/is-test? (= mode "test")]
      (testing (str "In " mode)
        (testing (str "\na namespace without :instrument/always meta should " (if (= mode "prod") "" "not") " be skipped")
          (let [n (create-ns (symbol (mt/random-name)))]
            (if (= mode "prod")
              (is (false? (mu.fn/instrument-ns? n)))
              (is (true? (mu.fn/instrument-ns? n))))))
        (testing "\na namespace with :instrument/always meta should not be skipped"
          (let [n (doto ^clojure.lang.Namespace (create-ns (symbol (mt/random-name)))
                    (.resetMeta {:instrument/always true}))]
            (is (true? (mu.fn/instrument-ns? n)))))))))

(deftest ^:parallel instrumentation-can-be-omitted
  (testing "omission in macroexpansion"
    (testing "returns a simple fn*"
      (mt/with-dynamic-fn-redefs [mu.fn/instrument-ns? (constantly false)]
        (let [expansion (macroexpand `(mu.fn/fn :- :int [] "foo"))]
          (is (= '(fn* ([] "foo"))
                 expansion)))))
    (testing "returns an instrumented fn"
      (mt/with-dynamic-fn-redefs [mu.fn/instrument-ns? (constantly true)]
        (let [expansion (macroexpand `(mu.fn/fn :- :int [] "foo"))]
          (is (= '(let* [&f (clojure.core/fn [] "foo")
                         &schema+explainers (metabase.util.malli.fn/fn-schemas->schema+explainers
                                             [:=> :cat :int])])
                 (take 2 expansion)))))))
  (testing "by default, instrumented forms are emitted"
    (let [f (mu.fn/fn :- :int [] "schemas aren't checked if this is returned")]
      (try (f)
           (is false "(f) did not throw")
           (catch Exception e
             (is (=? {:type ::mu.fn/invalid-output} (ex-data e)))))))
  (testing "when instrument-ns? returns false, unvalidated form is emitted"
    (mt/with-dynamic-fn-redefs [mu.fn/instrument-ns? (constantly false)]
      ;; we have to use eval here because `mu.fn/fn` is expanded at _read_ time and we want to change the
      ;; expansion via [[mu.fn/instrument-ns?]]. So that's why we call eval here. Could definitely use some
      ;; macroexpansion tests as well.
      (let [f (eval `(mu.fn/fn :- :int [] "schemas aren't checked if this is returned"))]
        (try (f)
             (is (= "schemas aren't checked if this is returned"
                    (f)))
             (catch Exception _e
               (is false "it threw a schema error")))))))
