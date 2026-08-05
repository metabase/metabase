(ns metabase.core.module-cycles-test
  "Ratchet on circular dependencies between modules: the recorded cycles live in
  `.clj-kondo/module-cycles.edn` and only ever shrink."
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.module-cycles :as module-cycles]))

(set! *warn-on-reflection* true)

;; Outside CI, tighten the record before asserting — the fix rides along in your next commit.
(use-fixtures :once (fn [thunk]
                      (when-not (System/getenv "CI")
                        ;; only writes .clj-kondo/module-cycles.edn, from a :once fixture that
                        ;; finishes before the parallel tests below run
                        #_{:clj-kondo/ignore [:metabase/validate-deftest]}
                        (module-cycles/fix!))
                      (thunk)))

;;;; ---------------------------------------------------------------------------
;;;; The ratchet itself
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel cycles-within-recorded-state-test
  (testing (str "\nThe module dependency cycles in " module-cycles/modules-config-file " must stay within\n"
                "what " module-cycles/cycles-file " records, in both graphs:\n"
                "\n"
                ":uses               -- the `require` graph.\n"
                ":uses+model-imports -- plus `:model/X` references, which resolve through Toucan's\n"
                "  registry rather than a `require`. Regressing this one and not the other means you\n"
                "  added a model reference: no new require, but the module still cannot be loaded\n"
                "  without the model's module now.\n"
                "\n"
                "Within a graph:\n"
                ":escaped-modules -- a module joined an SCC, two SCCs merged, or a new SCC appeared.\n"
                "  Break the cycle. If it genuinely has to exist, `./bin/mage fix-module-cycles --seed`\n"
                "  and defend the widening in your PR.\n"
                ":edges -- new dependencies between modules already in a cycle together.\n"
                "  Cheaper to fix than it looks: usually one require or one model reference.\n"
                ":newly-unconstrained -- a module started declaring `:uses :any` or\n"
                "  `:model-imports :bypass`, hiding its dependencies from this check entirely.\n"
                "\n"
                "Drift in the other direction (a cycle you broke) means `fix!` is broken, since the\n"
                "test fixture just ran it — unless you are in CI, where it does not run.")
    (is (= {}
           (module-cycles/drift (module-cycles/read-cycles)
                                (module-cycles/read-module-graphs))))))

(deftest ^:parallel cycles-file-normalized-test
  (testing (str "\n" module-cycles/cycles-file " should be sorted and aligned exactly as the generator"
                " writes it.\nAfter a hand edit, run `./bin/mage fix-module-cycles` to normalize the formatting.")
    (is (= (module-cycles/render (module-cycles/read-cycles))
           (slurp module-cycles/cycles-file)))))

(deftest ^:parallel model-imports-are-measured-test
  (testing (str "\nThe `:uses+model-imports` graph is a superset of `:uses`, so every module in a\n"
                "require cycle is in one there too. If this fails, the model edges have stopped\n"
                "being computed and half the ratchet is silently inert.")
    (let [{:keys [graphs]} (module-cycles/read-module-graphs)
          modules-in       (fn [k] (reduce into #{} (map :modules (module-cycles/actual-sccs (graphs k)))))]
      (is (every? (modules-in :uses+model-imports) (modules-in :uses))))))

;;;; ---------------------------------------------------------------------------
;;;; Reading the graphs out of the modules config
;;;; ---------------------------------------------------------------------------

;; a -> b -> c on requires alone, which is acyclic. c's import of :model/A closes the loop, and
;; b imports a model nobody exports, which resolves to no edge at all.
(def ^:private config
  '{a {:uses #{b}, :model-exports #{:model/A}}
    b {:uses #{c}, :model-imports #{:model/Unexported}}
    c {:model-exports #{:model/C}, :model-imports #{:model/A}}
    d {:uses :any}
    e {:model-imports :bypass}})

(deftest ^:parallel uses-graph-test
  (is (= '{a #{b}, b #{c}, c #{}, d #{}, e #{}}
         (module-cycles/uses-graph config))
      "`:uses :any` contributes no edges, and a module with no `:uses` key gets an empty set"))

(deftest ^:parallel model-owners-test
  (is (= '{:model/A a, :model/C c}
         (module-cycles/model-owners config))))

(deftest ^:parallel model-import-graph-test
  (is (= '{a #{}, b #{}, c #{a}, d #{}, e #{}}
         (module-cycles/model-import-graph config))
      (str "an import resolves to whichever module exports it; a model nobody exports resolves to "
           "nothing, and `:model-imports :bypass` contributes no edges")))

(deftest ^:parallel unconstrained-modules-test
  (is (= '{:uses #{d}, :model-imports #{e}}
         (module-cycles/unconstrained-modules config))
      "the two blind spots are tracked separately, since they hide different kinds of dependency"))

(deftest ^:parallel model-imports-add-cycles-test
  (testing "a -> b -> c on requires alone is acyclic; c's import of :model/A closes the loop"
    (is (= #{} (module-cycles/cyclic-components (module-cycles/uses-graph config))))
    (is (= '#{#{a b c}}
           (module-cycles/cyclic-components
            (merge-with into
                        (module-cycles/uses-graph config)
                        (module-cycles/model-import-graph config)))))))

;;;; ---------------------------------------------------------------------------
;;;; Cycle detection
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel cyclic-components-test
  (are [expected graph] (= expected (module-cycles/cyclic-components graph))
    ;; a DAG has no cycles
    #{}          '{a #{b}, b #{c}, c #{}}
    ;; mutual pair
    '#{#{a b}}   '{a #{b}, b #{a}}
    ;; three-cycle: the thing dev.deps-graph/circular-dependencies misses
    '#{#{a b c}} '{a #{b}, b #{c}, c #{a}}
    ;; a module depending on itself is not a cycle between modules
    #{}          '{a #{a}}
    ;; two independent cycles stay separate
    '#{#{a b} #{c d}} '{a #{b}, b #{a}, c #{d}, d #{c}}))

(deftest ^:parallel scc-label-test
  (are [expected modules] (= expected (module-cycles/scc-label modules))
    "2-module SCC (a, b)"         '#{b a}
    "3-module SCC (a, b, c)"      '#{c a b}
    "4-module SCC (a, b, c, ...)" '#{d c b a}))

(deftest ^:parallel edges-within-test
  (let [graph '{a #{b c}, b #{a}, c #{}}]
    (is (= 3 (module-cycles/edges-within graph '#{a b c})))
    (is (= 2 (module-cycles/edges-within graph '#{a b})) "a->c does not count, c is outside")
    (is (= 0 (module-cycles/edges-within graph '#{c})))))

(deftest ^:parallel actual-sccs-test
  (is (= '#{{:modules #{a b}, :edges 2}}
         (module-cycles/actual-sccs '{a #{b}, b #{a}, c #{a}}))
      "only cyclic components are reported, and only edges between their own members are counted"))

;;;; ---------------------------------------------------------------------------
;;;; Ratchet bookkeeping
;;;; ---------------------------------------------------------------------------

(def ^:private recorded
  '{:uses                  {:sccs #{{:modules #{a b c}, :edges 4}}}
    :uses+model-imports    {:sccs #{{:modules #{a b c}, :edges 4}}}
    :unconstrained-modules {:uses #{z}, :model-imports #{}}})

(defn- state
  "The shape [[module-cycles/drift]] takes, with the same graph in both slots unless told otherwise."
  ([uses] (state uses uses))
  ([uses with-models]
   {:graphs        {:uses uses, :uses+model-imports with-models}
    :unconstrained {:uses '#{z}, :model-imports #{}}}))

(deftest ^:parallel drift-accepts-improvements-test
  (are [graph] (= {} (module-cycles/drift recorded (state graph)))
    ;; unchanged
    '{a #{b}, b #{c}, c #{a}, z #{}}
    ;; the SCC shrank
    '{a #{b}, b #{a}, c #{a}, z #{}}
    ;; the SCC is gone entirely
    '{a #{b}, b #{c}, c #{}, z #{}})
  (testing "an SCC that split into two smaller ones"
    (let [recorded '{:uses                  {:sccs #{{:modules #{a b c d}, :edges 4}}}
                     :uses+model-imports    {:sccs #{{:modules #{a b c d}, :edges 4}}}
                     :unconstrained-modules {:uses #{z}, :model-imports #{}}}]
      (is (= {} (module-cycles/drift recorded (state '{a #{b}, b #{a}, c #{d}, d #{c}})))))))

(deftest ^:parallel drift-rejects-regressions-test
  (testing "a module joining a recorded SCC"
    (is (= '{:uses               {:escaped-modules #{a b c d}}
             :uses+model-imports {:escaped-modules #{a b c d}}}
           (module-cycles/drift recorded (state '{a #{b}, b #{c}, c #{d}, d #{a}, z #{}})))))
  (testing "a brand new SCC between modules that were not in one"
    (is (= '{:uses               {:escaped-modules #{x y}}
             :uses+model-imports {:escaped-modules #{x y}}}
           (module-cycles/drift recorded (state '{a #{b}, b #{c}, c #{a}, x #{y}, y #{x}, z #{}})))))
  (testing "new dependencies between modules already in the same SCC"
    (is (= {:uses               {:edges {"3-module SCC (a, b, c)" {:recorded 4, :actual 6}}}
            :uses+model-imports {:edges {"3-module SCC (a, b, c)" {:recorded 4, :actual 6}}}}
           (module-cycles/drift recorded (state '{a #{b c}, b #{a c}, c #{a b}, z #{}})))))
  (testing "a module newly hiding its dependencies behind `:model-imports :bypass`"
    (is (= '{:newly-unconstrained {:model-imports #{q}}}
           (module-cycles/drift recorded
                                {:graphs        {:uses               '{a #{b}, b #{c}, c #{a}, z #{}}
                                                 :uses+model-imports '{a #{b}, b #{c}, c #{a}, z #{}}}
                                 :unconstrained {:uses '#{z}, :model-imports '#{q}}})))))

(deftest ^:parallel drift-reports-graphs-independently-test
  (testing "a new model reference regresses only the graph that can see it"
    (is (= '{:uses+model-imports {:escaped-modules #{a b c d}}}
           (module-cycles/drift recorded
                                (state '{a #{b}, b #{c}, c #{a}, d #{}, z #{}}
                                       '{a #{b}, b #{c}, c #{d}, d #{a}, z #{}})))
        "this is exactly the regression a require-only ratchet waves through")))

(deftest ^:parallel tightened-only-narrows-test
  (testing "an SCC that shrank is re-recorded at its new size and edge count, in both graphs"
    (is (= '{:uses                  {:sccs #{{:modules #{a b}, :edges 2}}}
             :uses+model-imports    {:sccs #{{:modules #{a b}, :edges 2}}}
             :unconstrained-modules {:uses #{z}, :model-imports #{}}}
           (module-cycles/tightened recorded (state '{a #{b}, b #{a}, c #{a}, z #{}})))))
  (testing "an SCC that split is recorded as its pieces, each capped at the budget it came from"
    (let [recorded '{:uses                  {:sccs #{{:modules #{a b c d}, :edges 1}}}
                     :uses+model-imports {:sccs #{{:modules #{a b c d}, :edges 1}}}}]
      (is (= '#{{:modules #{a b}, :edges 1} {:modules #{c d}, :edges 1}}
             (get-in (module-cycles/tightened recorded (state '{a #{b}, b #{a}, c #{d}, d #{c}}))
                     [:uses :sccs])))))
  (testing "an SCC that is gone is dropped"
    (is (= #{} (get-in (module-cycles/tightened recorded (state '{a #{b}, b #{}, c #{}, z #{}}))
                       [:uses :sccs]))))
  (testing "a regression is left alone, so the ratchet still fails on it"
    (is (= '#{{:modules #{a b c}, :edges 4}}
           (get-in (module-cycles/tightened recorded (state '{a #{b}, b #{c}, c #{d}, d #{a}, z #{}}))
                   [:uses :sccs]))
        "the grown SCC is not a subset of the recorded one, so nothing is re-recorded")))

(deftest ^:parallel seeded-widens-test
  (is (= '{:uses                  {:sccs #{{:modules #{a b c d}, :edges 4}}}
           :uses+model-imports    {:sccs #{{:modules #{a b c d}, :edges 4}}}
           :unconstrained-modules {:uses #{z}, :model-imports #{}}}
         (module-cycles/seeded (state '{a #{b}, b #{c}, c #{d}, d #{a}})))
      "--seed records whatever is there, which is the only way to widen"))

(deftest ^:parallel render-test
  (testing "the text round-trips losslessly and re-renders identically"
    (let [cycles '{:uses                  {:sccs #{{:modules #{b a}, :edges 3}}}
                   :uses+model-imports    {:sccs #{{:modules #{c b a}, :edges 5}}}
                   :unconstrained-modules {:uses #{q p}, :model-imports #{r}}}
          text   (module-cycles/render cycles)]
      (is (= cycles (edn/read-string text)))
      (is (= text (module-cycles/render (edn/read-string text))))))
  (testing "empty state"
    (let [text (module-cycles/render {:uses                  {:sccs #{}}
                                      :uses+model-imports    {:sccs #{}}
                                      :unconstrained-modules {:uses #{}, :model-imports #{}}})]
      (is (str/ends-with? text
                          (str ":uses\n {:sccs\n  #{}}\n\n"
                               " :uses+model-imports\n {:sccs\n  #{}}\n\n"
                               " :unconstrained-modules\n {:uses #{}\n\n  :model-imports #{}}}\n"))))))
