(ns hooks.clojure.test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.common]
   [hooks.common.modules :as modules]))

(defn- warn-about-disallowed-parallel-forms [form config]
  (letfn [(error! [form message]
            (hooks/reg-finding! (assoc (meta form)
                                       :message message
                                       :type :metabase/validate-deftest)))
          (f [form]
            (when-let [qualified-symbol (hooks.common/node->qualified-symbol form)]
              (cond
                (contains? (:parallel/unsafe config) qualified-symbol)
                (error! form (format "%s is not allowed inside a ^:parallel test or test fixture [:metabase/validate-deftest]" qualified-symbol))

                (and (not (contains? (:parallel/safe config) qualified-symbol))
                     (str/ends-with? (name qualified-symbol) "!"))
                (error! form (format "destructive functions like %s are not allowed inside a ^:parallel test or test fixture. If this should be allowed, add it to the whitelist in the Kondo config file [:metabase/validate-deftest]"
                                     qualified-symbol)))))
          (walk [form]
            (when-not (contains? (hooks.common/ignored-linters form) :metabase/validate-deftest)
              (f form)
              (doseq [child (:children form)]
                (walk child))))]
    (walk form)))

(defn- deftest-check-parallel
  "1. Check if test is marked ^:parallel / ^:synchronized correctly.
   2. Make sure disallowed forms are not used in ^:parallel tests.
   3. Disallow ^:parallel tests in namespaces marked ^:synchronous -- the
      ns marker is the author's blanket promise that nothing inside runs
      in parallel, so an individual ^:parallel deftest contradicts it."
  [{[_ test-name & body] :children, :as _node} ns-sym config]
  (let [test-metadata     (:meta test-name)
        metadata-sexprs   (map hooks/sexpr test-metadata)
        combined-metadata (transduce
                           (map (fn [x]
                                  (if (map? x)
                                    x
                                    {x true})))
                           (completing merge)
                           {}
                           metadata-sexprs)
        parallel?     (:parallel combined-metadata)
        synchronized? (:synchronized combined-metadata)
        ns-synchronous? (boolean (:synchronous (meta ns-sym)))]
    (when (and parallel? synchronized?)
      (hooks/reg-finding! (assoc (meta test-name)
                                 :message "Test should not be marked both ^:parallel and ^:synchronized"
                                 :type :metabase/validate-deftest)))
    (when (and parallel? ns-synchronous?)
      (hooks/reg-finding!
       (assoc (meta test-name)
              :message (str "Test should not be marked ^:parallel in a namespace marked ^:synchronous -- "
                            "the ns marker promises no parallel execution. "
                            "Drop ^:parallel from the deftest, or drop ^:synchronous from the ns. "
                            "[:metabase/validate-deftest]")
              :type :metabase/validate-deftest)))
    ;; only when the custom `:metabase/deftest-not-marked-parallel-or-synchronized` is enabled: complain if tests are
    ;; not explicitly marked `^:parallel` or `^:synchronized`. This is mostly to encourage people to mark everything
    ;; `^:parallel` in places like `metabase.lib` tests unless there is a really good reason not to.
    (when-not (or parallel? synchronized?)
      (hooks/reg-finding!
       (assoc (meta test-name)
              :message "Test should be marked either ^:parallel or ^:synchronized"
              :type :metabase/deftest-not-marked-parallel-or-synchronized)))
    (when parallel?
      (doseq [form body]
        (warn-about-disallowed-parallel-forms form config)))))

(defn- deftest-check-not-horrifically-long
  [node {:keys [max-length], :as _config}]
  (let [{:keys [row end-row]} (meta node)]
    (when (and row end-row)
      (let [num-lines (- end-row row)]
        (when (and max-length
                   (>= num-lines max-length))
          (hooks/reg-finding! (assoc (meta node)
                                     :message (str (format "This test is horrifically long, it's %d lines! 😱 " num-lines)
                                                   "Do you really want to try to debug it if it fails? 💀 "
                                                   "Split it up into smaller tests! 🥰")
                                     :type :metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests)))))))

(defn- every-top-level-form-in-deftest-is-testing? [{[_deftest _test-name & forms] :children, :as _node}]
  (every? (fn [{[first-child] :children, :as form}]
            (and (hooks/list-node? form)
                 (= (hooks.common/node->qualified-symbol first-child)
                    'clojure.test/testing)))
          forms))

(defn- num-top-level-forms-in-deftest [{[_deftest _test-name & forms] :children, :as _node}]
  (count forms))

(defn- deftest-check-should-not-be-multiple-separate-tests
  "Warn on long tests (tests over `min-length`) that look like

    (deftest my-test
      (testing ...)
      (testing ...)
      (testing ...))"
  [node {:keys [min-length], :as _config}]
  (let [{:keys [row end-row]} (meta node)
        test-length           (- end-row row)]
    (when (and min-length
               (> test-length min-length)
               (every-top-level-form-in-deftest-is-testing? node)
               (> (num-top-level-forms-in-deftest node) 1))
      (hooks/reg-finding!
       (assoc (meta node)
              :message (str "This test looks like it contains several logically separate testing forms... break it"
                            " out into separate deftests to make it easier to test and debug")
              :type    :metabase/validate-deftest-logically-separate-tests)))))

(defn- ignore? [node error-type]
  (contains? (hooks.common/ignored-linters node) error-type))

(defn deftest-check-no-driver-keywords [node {:keys [drivers], :as _config}]
  ;; fail fast after we see the first error, where we see one hardcoded driver name there are likely several more and we
  ;; don't need multiple warnings for a single test.
  (letfn [(f [node]
            (when (and (hooks/keyword-node? node)
                       (set? drivers)
                       (contains? drivers (hooks/sexpr node)))
              (hooks/reg-finding! (assoc (meta node)
                                         :message (format "Do not hardcode driver name %s in driver tests! [:metabase/disallow-hardcoded-driver-names-in-tests]"
                                                          (hooks/sexpr node))
                                         :type    :metabase/disallow-hardcoded-driver-names-in-tests))
              ::error))
          (walk [node]
            (cond
              (ignore? node :metabase/disallow-hardcoded-driver-names-in-tests)
              nil

              (= (f node) ::error)
              ::error

              :else
              (reduce
               (fn [_acc child]
                 (when (= (walk child) ::error)
                   (reduced ::error)))
               nil
               (:children node))))]
    (walk node)))

(defn- test-namespace-lives-outside-of-module-system? [ns-symb]
  (some (fn [prefix]
          (str/starts-with? (name ns-symb) prefix))
        ["build-drivers."
         "build."
         "i18n." ; bin/i18n
         "lint-migrations-file-test"
         "main-test" ; bin/release-list
         "metabase.deps-edn-test"
         "metabase.driver."
         "metabase.test."
         "metabase.test.data."
         "metabuild-common."])) ; utils for build scripts

(let [warned-namespaces (atom #{})]
  (defn deftest-check-in-valid-module
    "Check whether a `deftest` lives in a known module -- important so our system to only run a subset of tests based on
  which modules have changes picks them up correctly. (DEV-1125)"
    [{:keys [node], ns-symb :ns, :as input}]
    (when (and ns-symb
               (not (test-namespace-lives-outside-of-module-system? ns-symb))
               ;; only warn once per namespace
               (not (contains? @warned-namespaces ns-symb)))
      (swap! warned-namespaces conj ns-symb)
      (let [known-modules  (set (keys (:metabase/modules (modules/config input))))
            current-module (modules/module ns-symb)]
        (when (or (not current-module)
                  (not (contains? known-modules current-module)))
          (hooks/reg-finding! (assoc (meta node)
                                     :message (format "All tests must live in a known module; %s is not a known module" (pr-str current-module))
                                     :type    :metabase/tests-must-live-in-known-modules)))))))

(defn deftest [{:keys [node cljc lang config], ns-sym :ns, :as input}]
  ;; run [[deftest-check-parallel]] only once... if this is a `.cljc` file only run it for the `:clj` analysis, no point
  ;; in running it twice.
  (when (or (not cljc)
            (= lang :clj))
    (deftest-check-parallel node ns-sym (get-in config [:linters :metabase/validate-deftest])))
  (deftest-check-not-horrifically-long node (get-in config [:linters :metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]))
  (deftest-check-should-not-be-multiple-separate-tests node (get-in config [:linters :metabase/validate-deftest-logically-separate-tests]))
  (deftest-check-no-driver-keywords node (get-in config [:linters :metabase/disallow-hardcoded-driver-names-in-tests]))
  (deftest-check-in-valid-module input)
  input)

;;; this is a hacky way to determine whether these namespaces are required in the `ns` form or not... basically `:ns`
;;; will come back as `nil` if they are not.
(defn- approximately-equal-ns-required? []
  (= (:ns (hooks/resolve {:name 'metabase.test-runner.assert-exprs.approximately-equal/=?-report}))
     'metabase.test-runner.assert-exprs.approximately-equal))

(defn- malli-equals-ns-required? []
  (= (:ns (hooks/resolve {:name 'metabase.test-runner.assert-exprs.malli-equals/malli=-report}))
     'metabase.test-runner.assert-exprs.malli-equals))

(defn- warn-about-missing-test-expr-requires-in-cljs [{:keys [children], :as _is-node}]
  (let [[_is assertion-node] children]
    (when (hooks/list-node? assertion-node)
      (let [[assertion-symb-node] (:children assertion-node)]
        (when (hooks/token-node? assertion-symb-node)
          (let [assertion-symb-token (hooks/sexpr assertion-symb-node)
                warn!                (fn [ns-to-require]
                                       (hooks/reg-finding!
                                        (assoc (meta assertion-symb-node)
                                               :message (format "You must require %s to use %s in ClojureScript"
                                                                ns-to-require
                                                                assertion-symb-token)
                                               :type :metabase/missing-test-expr-requires-in-cljs)))]
            (condp = assertion-symb-token
              '=?
              (when-not (approximately-equal-ns-required?)
                (warn! 'metabase.test-runner.assert-exprs.approximately-equal))

              'malli=
              (when-not (malli-equals-ns-required?)
                (warn! 'metabase.test-runner.assert-exprs.malli-equals))

              nil)))))))

(defn is [{:keys [node lang], :as input}]
  (when (= lang :cljs)
    (warn-about-missing-test-expr-requires-in-cljs node))
  input)

(defn use-fixtures
  "Flag `:parallel/unsafe` forms inside fixtures. Skipped when the surrounding
  namespace is marked `^:synchronous` -- the ns marker is the author's
  explicit opt-in to a single-threaded test ns where destructive setup is
  safe. Without that opt-in, kondo can't know whether sibling deftests will
  be `^:parallel`, so the conservative default is to flag.

  Sister to [[deftest-check-parallel]]: the deftest hook rejects `^:parallel`
  tests inside a `^:synchronous` ns, so the two checks together form a
  coherent opt-in: either the whole ns is synchronous (fixtures can be
  anything; no parallel tests allowed) or it isn't (fixtures must be
  parallel-safe)."
  [{:keys [node config], ns-sym :ns, :as input}]
  (when-not (:synchronous (meta ns-sym))
    (let [linter-config (get-in config [:linters :metabase/validate-deftest])]
      (doseq [form (rest (:children node))]
        (warn-about-disallowed-parallel-forms form linter-config))))
  input)

(defn testing
  "Check that we don't have an empty `testing` form like

    (testing \"message\")"
  [{{[_testing _message & body] :children, :as node} :node, :as input}]
  (when (empty? body)
    (hooks/reg-finding!
     (assoc (meta node)
            :message "A `testing` form that doesn't wrap anything doesn't do anything"
            :type    :metabase/check-testing-not-empty)))
  input)
