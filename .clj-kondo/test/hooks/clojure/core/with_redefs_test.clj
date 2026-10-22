(ns hooks.clojure.core.with-redefs-test
  (:require
   [clj-kondo.core :as kondo]
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [hooks.clojure.core.with-redefs]))

;;; The new hook delegates the "is this LHS a regular defn?" decision to clj-kondo's own
;;; analysis cache via [[hooks/resolve]] and [[hooks/ns-analysis]]. In unit tests we have
;;; no cache, so we stub those calls. The mapping below describes what each stubbed name
;;; should pretend to be.

(def ^:private stub-vars
  "Map of unqualified-name → kondo-style var-definition. Names not in the map are treated
   as `:clj-kondo/unknown-namespace` (unresolved). A `:fixed-arities` (or
   `:varargs-min-arity`) entry means \"this is a `defn`\" and is the only thing that lets
   the nudge fire."
  '{plain-fn        {:ns example.ns :name plain-fn :fixed-arities #{1}}
    plain-fn-2      {:ns example.ns :name plain-fn-2 :fixed-arities #{0}}
    a-multimethod   {:ns example.ns :name a-multimethod}     ; defmulti — no arities
    can-read?       {:ns example.ns :name can-read?}         ; defmulti
    can-query?      {:ns example.ns :name can-query?}        ; defmulti
    a-value         {:ns example.ns :name a-value}           ; (def a-value 42) — no arities
    ;; Re-exported with potemkin/import-vars: kondo records no arity here, see `proxied-vars`.
    proxied-fn      {:ns example.ns :name proxied-fn}
    proxied-multi   {:ns example.ns :name proxied-multi}
    proxied-clash   {:ns example.ns :name proxied-clash}})

(def ^:private proxied-vars
  "How `example.real-ns`, where the `proxied-*` vars are really defined, looks in its own analysis."
  '{proxied-fn    {:ns example.real-ns :name proxied-fn :fixed-arities #{1}}
    proxied-multi {:ns example.real-ns :name proxied-multi}
    proxied-clash {:ns example.real-ns :name proxied-clash :fixed-arities #{1}}})

(def ^:private other-proxied-vars
  "A second re-export source that also defines `proxied-clash`, as a defmulti."
  '{proxied-clash {:ns example.other-ns :name proxied-clash}})

(defn- stub-resolve [{nm :name}]
  (when (symbol? nm)
    (let [bare (symbol (name nm))]
      (if (contains? stub-vars bare)
        {:ns 'example.ns :name bare}
        {:ns :clj-kondo/unknown-namespace :name bare}))))

(def ^:private stub-analyses
  {'example.ns       {:clj (assoc stub-vars :proxied-namespaces '(example.real-ns example.other-ns))}
   'example.real-ns  {:clj proxied-vars}
   'example.other-ns {:clj other-proxied-vars}})

(defn- analyses
  "A stand-in for `hooks/ns-analysis` that serves `stub-analyses` with `overrides` merged in, both keyed by namespace.
   Like kondo, it returns `{}` for a namespace that has no cache entry."
  [overrides]
  (let [by-ns (merge stub-analyses overrides)]
    #(get by-ns % {})))

(def ^:private stub-ns-analysis
  (analyses nil))

(defn- cljs-defn
  "How kondo records a defn, for the `:cljs` side of a namespace's analysis."
  [ns-sym var-sym]
  {:ns ns-sym, :name var-sym, :fixed-arities #{1}})

(defn- lint
  "Run the hook on the given source. Pass a string to preserve reader-macro literals like
   `#(...)` (whose `:fn` node tag is distinct from a regular list); pass a quoted form
   for the common case where exact node shape doesn't matter. The optional
   `analysis-fn` stub overrides `hooks/ns-analysis` for tests that want to simulate a
   cache miss or other non-default cache state, and `lang` the language kondo is linting the form as."
  ([src] (lint src stub-ns-analysis))
  ([src analysis-fn] (lint src analysis-fn :clj))
  ([src analysis-fn lang]
   (binding [clj-kondo.impl.utils/*ctx*
             {:config     {:linters {:metabase/prefer-with-dynamic-fn-redefs {:level :warning}}}
              :ignores    (atom nil)
              :findings   (atom [])
              :namespaces (atom {})}]
     (with-redefs [hooks/resolve     stub-resolve
                   hooks/ns-analysis analysis-fn]
       (hooks.clojure.core.with-redefs/lint-with-redefs
        {:node (hooks/parse-string (if (string? src) src (pr-str src)))
         :lang lang}))
     @(:findings clj-kondo.impl.utils/*ctx*))))

(deftest ^:synchronized flags-when-every-lhs-is-defn-test
  (testing "RHS shape doesn't matter — once every LHS resolves to a defn, the form is a
            migration candidate regardless of what's on the right. We deliberately stick
            to `IFn`-valued shapes here (fns, keywords, colls) — pairing a fn-var LHS
            with a non-`IFn` value (`42`) would be a weird shape callers wouldn't realistically
            write, and `with-dynamic-fn-redefs` would throw at proxy time anyway."
    (doseq [rhs ['(fn [x] x)
                 '(constantly 42)
                 '(partial + 1)
                 '(comp inc dec)
                 'identity              ; bare symbol resolving to an IFn
                 '(foo/constantly 42)   ; namespaced lookalike — no longer special-cased
                 :a-key                 ; keyword (IFn)
                 {:a 1}                 ; map (IFn)
                 [1 2 3]]]              ; vector (IFn)
      (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
              (lint (list 'with-redefs ['plain-fn rhs] :body)))
          (str "expected nudge for RHS: " (pr-str rhs)))))
  (testing "reader-macro `#(...)` literal — passed as a string so it parses as a
            `:fn`-tagged node, not the post-expansion `(fn* …)` list. Still works because
            it's just one more shape the LHS-only rule treats uniformly."
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint "(with-redefs [plain-fn #(inc %)] (plain-fn 1))"))))
  (testing "multiple bindings, every LHS is a defn"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [plain-fn   (constantly 1)
                                 plain-fn-2 (fn [] 2)]
                     (plain-fn))))))
  (testing "a defn re-exported with potemkin/import-vars"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [proxied-fn (constantly 1)] :body))))))

(deftest ^:synchronized skips-multimethod-and-value-targets-test
  (testing "defmulti — no arity in analysis, so don't nudge"
    (is (= [] (lint '(with-redefs [a-multimethod (fn [& _] nil)] :body))))
    (is (= [] (lint '(with-redefs [can-read? (constantly true)] :body))))
    (is (= [] (lint '(with-redefs [can-query? (constantly false)] :body)))))
  (testing "plain `def` value also has no arity — don't nudge"
    (is (= [] (lint '(with-redefs [a-value (fn [] 1)] :body)))))
  (testing "any unresolved symbol skips the nudge — we never know what it is"
    (is (= [] (lint '(with-redefs [unknown.ns/something (fn [& _] nil)] :body)))))
  (testing "empty analysis (cache miss for the resolved ns) → skip the nudge"
    (is (= [] (lint '(with-redefs [plain-fn (fn [x] x)] :body)
                    (constantly {})))))
  (testing "mixed bindings — even one non-defn LHS suppresses the nudge"
    (is (= [] (lint '(with-redefs [plain-fn      (fn [x] x)
                                   a-multimethod (fn [& _] nil)]
                       :body))))))

(deftest ^:synchronized judges-vars-by-their-clj-definition-test
  (testing "a cljc var that is a defn only on the cljs side"
    (is (= [] (lint '(with-redefs [a-multimethod (fn [& _] nil)] :body)
                    (analyses {'example.ns {:clj  stub-vars
                                            :cljs {'a-multimethod (cljs-defn 'example.ns 'a-multimethod)}}})))))
  (testing "a cljc re-export source that is a defn only on the cljs side"
    (is (= [] (lint '(with-redefs [proxied-multi (fn [& _] nil)] :body)
                    (analyses {'example.real-ns
                               {:clj  proxied-vars
                                :cljs {'proxied-multi (cljs-defn 'example.real-ns 'proxied-multi)}}})))))
  (testing "a form kondo lints as cljs, where `with-dynamic-fn-redefs` doesn't exist"
    (is (= [] (lint '(with-redefs [plain-fn (fn [x] x)] :body) stub-ns-analysis :cljs)))))

(deftest ^:synchronized skips-uncertain-re-exports-test
  (testing "a defmulti re-exported with potemkin/import-vars"
    (is (= [] (lint '(with-redefs [proxied-multi (fn [& _] nil)] :body)))))
  (testing "a name defined by two re-export sources, only one of them a defn"
    (is (= [] (lint '(with-redefs [proxied-clash (fn [& _] nil)] :body)))))
  (testing "a re-export source kondo can't read might be where the var comes from"
    (is (= [] (lint '(with-redefs [proxied-clash (fn [& _] nil)] :body)
                    (fn [ns-sym]
                      (when (= 'example.other-ns ns-sym)
                        (throw (ClassCastException. "unreadable cache entry")))
                      (stub-ns-analysis ns-sym))))))
  (testing "a re-export source missing from the cache might be where the var comes from"
    (is (= [] (lint '(with-redefs [proxied-clash (fn [& _] nil)] :body)
                    (analyses {'example.other-ns {}})))))
  (testing "a re-export source with no clj cache entry might be where the var comes from"
    (is (= [] (lint '(with-redefs [proxied-clash (fn [& _] nil)] :body)
                    (analyses {'example.other-ns {:cljs other-proxied-vars}})))))
  (testing "a private defn in a re-export source can't be what a var of the same name was imported from"
    (is (= [] (lint '(with-redefs [proxied-fn (fn [& _] nil)] :body)
                    (analyses {'example.real-ns {:clj (assoc-in proxied-vars ['proxied-fn :private] true)}}))))))

(deftest ^:synchronized follows-nested-re-exports-test
  (testing "a defn reached both directly and through a second re-export"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [proxied-fn (fn [& _] nil)] :body)
                  (analyses
                   {'example.ns     {:clj (assoc stub-vars :proxied-namespaces '(example.facade example.real-ns))}
                    'example.facade {:clj {'proxied-fn          {:ns 'example.facade, :name 'proxied-fn}
                                           :proxied-namespaces '(example.real-ns)}}}))))))

(deftest ^:synchronized terminates-on-cyclic-re-exports-test
  (testing "two namespaces that re-export from each other"
    (is (= [] (lint '(with-redefs [proxied-fn (fn [& _] nil)] :body)
                    (analyses {'example.ns     {:clj (assoc stub-vars :proxied-namespaces '(example.cyclic))}
                               'example.cyclic {:clj {'proxied-fn          {:ns 'example.cyclic, :name 'proxied-fn}
                                                      :proxied-namespaces '(example.ns)}}}))))))

(defn- delete-tree! [^java.io.File f]
  (when (.isDirectory f)
    (run! delete-tree! (.listFiles f)))
  (.delete f))

(defn- kondo-findings
  "Findings from a real kondo run over `test-files`, each a map of relative path to content.
   Lints `src-files` first to fill the cache, as `kondo --lint src test` does.
   The hook reads its decisions from the cache, which is only written after a file is analysed."
  [src-files test-files]
  (let [tmp-dir (.toFile (java.nio.file.Files/createTempDirectory
                          "with-redefs-smoke" (into-array java.nio.file.attribute.FileAttribute [])))
        lint!   (fn [dir files]
                  (doseq [[path content] files]
                    (io/make-parents tmp-dir dir path)
                    (spit (io/file tmp-dir dir path) content))
                  (kondo/run! {:lint       [(str (io/file tmp-dir dir))]
                               :cache-dir  (str (io/file tmp-dir "cache"))
                               :config-dir ".clj-kondo"}))]
    (try
      (lint! "src" src-files)
      (:findings (lint! "test" test-files))
      (finally (delete-tree! tmp-dir)))))

(deftest ^:synchronized integration-arities-iff-defn-smoke-test
  (testing "real kondo run validates the load-bearing invariant: only `defn`-style vars
            get arities recorded — `defmulti` and plain `def` do not. If a future kondo
            release breaks this, the smoke test fails here rather than the hook silently
            producing wrong nudges."
    (let [findings   (kondo-findings
                      {"smoke_fixture.clj" "(ns smoke-fixture)
(defmulti the-multi {:arglists '([x])} (fn [x] x))
(defn the-defn [x] x)
(def the-value 42)
"}
                      {"smoke_fixture_test.clj" "(ns smoke-fixture-test
  (:require [smoke-fixture :as f]))
(with-redefs [f/the-multi (constantly nil)] :a)
(with-redefs [f/the-defn  (constantly nil)] :b)
(with-redefs [f/the-value (constantly nil)] :c)
"})
          nudges     (filter #(= :metabase/prefer-with-dynamic-fn-redefs (:type %)) findings)
          nudge-rows (set (map :row nudges))]
      ;; Row 3 = the-multi, row 4 = the-defn, row 5 = the-value (matches the
      ;; with-redefs lines in the test fixture above).
      (testing "the defn binding gets nudged"
        (is (contains? nudge-rows 4)))
      (testing "the defmulti and def bindings do not get nudged"
        (is (not (contains? nudge-rows 3)))
        (is (not (contains? nudge-rows 5)))))))

(deftest ^:synchronized integration-follows-potemkin-import-vars-smoke-test
  (testing "real kondo run: only the re-exported defn (row 4) gets nudged"
    ;; Row 5 is a re-exported defmulti. Row 6 is a defmulti imported under the name of a private defn in its source.
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs, :row 4}]
            (kondo-findings
             {"smoke_impl.clj" "(ns smoke-impl)
(defn the-defn [x] x)
(defmulti the-multi {:arglists '([x])} (fn [x] x))
(defn- renamed [x] x)
"
              "smoke_core.clj" "(ns smoke-core
  (:require [potemkin :as p]
            [smoke-impl]))
(p/import-vars
 [smoke-impl
  the-defn
  the-multi])
(p/import-def smoke-impl/the-multi renamed)
"}
             {"smoke_core_test.clj" "(ns smoke-core-test
  (:require
   [smoke-core :as core]))
(with-redefs [core/the-defn (constantly nil)] :a)
(with-redefs [core/the-multi (constantly nil)] :b)
(with-redefs [core/renamed (constantly nil)] :c)
"})))))

(deftest ^:synchronized integration-deprecated-cljc-namespace-smoke-test
  (testing "real kondo run: a var in a deprecated cljc namespace is skipped without a hook error"
    (is (= [] (kondo-findings
               {"smoke_deprecated.cljc" "(ns smoke-deprecated {:deprecated \"use something else\"})
(defn the-defn [x] x)
"}
               {"smoke_deprecated_test.clj" "(ns smoke-deprecated-test
  {:clj-kondo/config '{:linters {:deprecated-namespace {:level :off}}}}
  (:require
   [smoke-deprecated :as dep]))
(with-redefs [dep/the-defn (constantly nil)] :a)
"})))))
