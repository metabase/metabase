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
    a-value         {:ns example.ns :name a-value}})         ; (def a-value 42) — no arities

(defn- stub-resolve [{nm :name}]
  (when (symbol? nm)
    (let [bare (symbol (name nm))]
      (if (contains? stub-vars bare)
        {:ns 'example.ns :name bare}
        {:ns :clj-kondo/unknown-namespace :name bare}))))

(defn- stub-ns-analysis [_ns-sym]
  ;; All stubbed vars live in `example.ns` for simplicity.
  {:clj stub-vars})

(defn- lint
  "Run the hook on the given source. Pass a string to preserve reader-macro literals like
   `#(...)` (whose `:fn` node tag is distinct from a regular list); pass a quoted form
   for the common case where exact node shape doesn't matter. The optional
   `analysis-fn` stub overrides `hooks/ns-analysis` for tests that want to simulate a
   cache miss or other non-default cache state."
  ([src] (lint src stub-ns-analysis))
  ([src analysis-fn]
   (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/prefer-with-dynamic-fn-redefs {:level :warning}}}
                                         :ignores    (atom nil)
                                         :findings   (atom [])
                                         :namespaces (atom {})}]
     (with-redefs [hooks/resolve     stub-resolve
                   hooks/ns-analysis analysis-fn]
       (hooks.clojure.core.with-redefs/lint-with-redefs
        {:node (hooks/parse-string (if (string? src) src (pr-str src)))}))
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
                     (plain-fn)))))))

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

(defn- spit-fixture! [^java.io.File f content]
  (.mkdirs (.getParentFile f))
  (spit f content))

(defn- delete-tree! [^java.io.File f]
  (when (.isDirectory f)
    (run! delete-tree! (.listFiles f)))
  (.delete f))

(defn- run-kondo-twice
  "Lint `src` first to populate `cache-dir` (mirroring the real `kondo --lint src test`
   pipeline), then lint `test-file` against that cache and return its findings. The
   two-pass shape is required because the hook reads its decisions from the cache, which
   is only written *after* a file is analysed."
  [cache-dir src-file test-file]
  (kondo/run! {:lint [(.getPath src-file)] :cache-dir cache-dir :config-dir ".clj-kondo"})
  (:findings (kondo/run! {:lint [(.getPath test-file)] :cache-dir cache-dir :config-dir ".clj-kondo"})))

(deftest ^:synchronized integration-arities-iff-defn-smoke-test
  (testing "real kondo run validates the load-bearing invariant: only `defn`-style vars
            get arities recorded — `defmulti` and plain `def` do not. If a future kondo
            release breaks this, the smoke test fails here rather than the hook silently
            producing wrong nudges."
    (let [tmp-dir   (.toFile (java.nio.file.Files/createTempDirectory
                              "with-redefs-smoke" (into-array java.nio.file.attribute.FileAttribute [])))
          cache-dir (str tmp-dir "/cache")
          src       (io/file tmp-dir "smoke_fixture.clj")
          tst       (io/file tmp-dir "smoke_fixture_test.clj")]
      (try
        (spit-fixture! src "(ns smoke-fixture)
(defmulti the-multi {:arglists '([x])} (fn [x] x))
(defn the-defn [x] x)
(def the-value 42)
")
        (spit-fixture! tst "(ns smoke-fixture-test
  (:require [smoke-fixture :as f]))
(with-redefs [f/the-multi (constantly nil)] :a)
(with-redefs [f/the-defn  (constantly nil)] :b)
(with-redefs [f/the-value (constantly nil)] :c)
")
        (let [findings   (run-kondo-twice cache-dir src tst)
              nudges     (filter #(= :metabase/prefer-with-dynamic-fn-redefs (:type %)) findings)
              nudge-rows (set (map :row nudges))]
          ;; Row 3 = the-multi, row 4 = the-defn, row 5 = the-value (matches the
          ;; with-redefs lines in the test fixture above).
          (testing "the defn binding gets nudged"
            (is (contains? nudge-rows 4)))
          (testing "the defmulti and def bindings do not get nudged"
            (is (not (contains? nudge-rows 3)))
            (is (not (contains? nudge-rows 5)))))
        (finally (delete-tree! tmp-dir))))))
