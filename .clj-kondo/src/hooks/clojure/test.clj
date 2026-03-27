(ns hooks.clojure.test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.common]
   [hooks.common.modules :as modules]))

(defn- disallowed-parallel-form
  "If `form` is a disallowed parallel form, return the qualified symbol. Otherwise return nil."
  [form config]
  (when-let [qualified-symbol (hooks.common/node->qualified-symbol form)]
    (cond
      (contains? (:parallel/unsafe config) qualified-symbol)
      qualified-symbol

      (and (not (contains? (:parallel/safe config) qualified-symbol))
           (str/ends-with? (name qualified-symbol) "!"))
      qualified-symbol)))

(defn detect-disallowed-parallel-forms
  "Walk `form` and return a vector of `{:node node, :symbol symbol}` maps for all disallowed parallel forms found."
  [form config]
  (let [result (when-let [sym (disallowed-parallel-form form config)]
                 [{:node form, :symbol sym}])]
    (into (vec result)
          (mapcat #(detect-disallowed-parallel-forms % config))
          (:children form))))

(defn- warn-about-disallowed-parallel-forms [form config]
  (doseq [{:keys [node symbol]} (detect-disallowed-parallel-forms form config)]
    (hooks/reg-finding!
     (assoc (meta node)
            :message (if (contains? (:parallel/unsafe config) symbol)
                       (format "%s is not allowed inside a ^:parallel test or test fixture [:metabase/validate-deftest]" symbol)
                       (format "destructive functions like %s are not allowed inside a ^:parallel test or test fixture. If this should be allowed, add it to the whitelist in the Kondo config file [:metabase/validate-deftest]"
                               symbol))
            :type :metabase/validate-deftest))))

(defn- deftest-check-parallel
  "1. Check if test is marked ^:parallel / ^:synchronized correctly
   2. Make sure disallowed forms are not used in ^:parallel tests"
  [{[_ test-name & body] :children, :as _node} config]
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
        synchronized? (:synchronized combined-metadata)]
    (when (and parallel? synchronized?)
      (hooks/reg-finding! (assoc (meta test-name)
                                 :message "Test should not be marked both ^:parallel and ^:synchronized"
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

(defn deftest [{:keys [node cljc lang config], :as input}]
  ;; run [[deftest-check-parallel]] only once... if this is a `.cljc` file only run it for the `:clj` analysis, no point
  ;; in running it twice.
  (when (or (not cljc)
            (= lang :clj))
    (deftest-check-parallel node (get-in config [:linters :metabase/validate-deftest])))
  (deftest-check-not-horrifically-long node (get-in config [:linters :metabase/i-like-making-cams-eyes-bleed-with-horrifically-long-tests]))
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

(defn is [{:keys [node lang]}]
  (when (= lang :cljs)
    (warn-about-missing-test-expr-requires-in-cljs node))
  {:node node})

(defn use-fixtures [{:keys [node config]}]
  (let [{[_ fixture-type-node & body] :children} node]
    (when (and fixture-type-node
               (hooks/keyword-node? fixture-type-node)
               (= :each (hooks/sexpr fixture-type-node)))
      (let [linter-config (get-in config [:linters :metabase/validate-deftest])]
        (doseq [form body]
          (warn-about-disallowed-parallel-forms form linter-config)))))
  {:node node})
