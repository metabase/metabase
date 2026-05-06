(ns hooks.clojure.core.with-redefs-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clj-kondo.impl.utils]
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
   for the common case where exact node shape doesn't matter."
  [src]
  (binding [clj-kondo.impl.utils/*ctx* {:config     {:linters {:metabase/prefer-with-dynamic-fn-redefs {:level :warning}}}
                                        :ignores    (atom nil)
                                        :findings   (atom [])
                                        :namespaces (atom {})}]
    (with-redefs [hooks/resolve     stub-resolve
                  hooks/ns-analysis stub-ns-analysis]
      (hooks.clojure.core.with-redefs/lint-with-redefs
       {:node (hooks/parse-string (if (string? src) src (pr-str src)))}))
    @(:findings clj-kondo.impl.utils/*ctx*)))

(deftest ^:synchronized flags-fn-shaped-rhs-test
  (testing "fn literal redefining a known defn"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [plain-fn (fn [x] x)] (plain-fn 1))))))
  (testing "reader-macro fn literal — must be a string source so `#(...)` parses as a
            `:fn`-tagged node, not the post-expansion `(fn* …)` list. Quoted forms
            round-trip through pr-str/parse-string and lose the reader-macro shape."
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint "(with-redefs [plain-fn #(inc %)] (plain-fn 1))"))))
  (testing "(constantly …)"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [plain-fn (constantly 42)] (plain-fn))))))
  (testing "(partial …), (comp …), (complement …), (identity)"
    (is (=? [{}] (lint '(with-redefs [plain-fn (partial + 1)] (plain-fn)))))
    (is (=? [{}] (lint '(with-redefs [plain-fn (comp inc dec)] (plain-fn)))))
    (is (=? [{}] (lint '(with-redefs [plain-fn (complement odd?)] (plain-fn)))))
    (is (=? [{}] (lint '(with-redefs [plain-fn (identity inc)] (plain-fn))))))
  (testing "multiple bindings, all fn-shaped and all defns"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [plain-fn   (constantly 1)
                                 plain-fn-2 (fn [] 2)]
                     (plain-fn)))))))

(deftest ^:synchronized skips-multimethod-and-value-targets-test
  (testing "defmulti — no arity in analysis, so don't nudge even with fn-shaped RHS"
    (is (= [] (lint '(with-redefs [a-multimethod (fn [& _] nil)] :body))))
    (is (= [] (lint '(with-redefs [can-read? (constantly true)] :body))))
    (is (= [] (lint '(with-redefs [can-query? (constantly false)] :body)))))
  (testing "plain `def` value also has no arity — don't nudge"
    (is (= [] (lint '(with-redefs [a-value (fn [] 1)] :body)))))
  (testing "any unresolved symbol skips the nudge — we never know what it is"
    (is (= [] (lint '(with-redefs [unknown.ns/something (fn [& _] nil)] :body)))))
  (testing "a *qualified* alias still resolves on the unqualified name"
    (is (=? [{:type :metabase/prefer-with-dynamic-fn-redefs}]
            (lint '(with-redefs [some.alias/plain-fn (constantly 1)] :body)))))
  (testing "mixed bindings — even one non-defn LHS suppresses the nudge"
    (is (= [] (lint '(with-redefs [plain-fn      (fn [x] x)
                                   a-multimethod (fn [& _] nil)]
                       :body))))))

(deftest ^:synchronized ignores-non-fn-rhs-test
  (testing "literal value"
    (is (= [] (lint '(with-redefs [a-value 200] :body)))))
  (testing "map / vector / set literal"
    (is (= [] (lint '(with-redefs [a-value {:a 1}] :body))))
    (is (= [] (lint '(with-redefs [a-value [1 2 3]] :body))))
    (is (= [] (lint '(with-redefs [a-value #{:a}] :body)))))
  (testing "non-fn-producing call (e.g. assoc, make-hierarchy, vec)"
    (is (= [] (lint '(with-redefs [a-value (assoc {} :k :v)] :body))))
    (is (= [] (lint '(with-redefs [a-value (make-hierarchy)] :body)))))
  (testing "bare symbol — conservatively left alone even though `identity` is a fn"
    (is (= [] (lint '(with-redefs [plain-fn identity] :body)))))
  (testing "one fn-shaped + one non-fn → do not nudge (mixed intent)"
    (is (= [] (lint '(with-redefs [plain-fn   (constantly 1)
                                   plain-fn-2 42]
                       :body))))))
