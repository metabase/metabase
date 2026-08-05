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
                        ;; only writes .clj-kondo/module-cycles.edn, from a :once fixture that finishes
                        ;; before the parallel tests below run
                        #_{:clj-kondo/ignore [:metabase/validate-deftest]}
                        (module-cycles/fix!))
                      (thunk)))

;;;; ---------------------------------------------------------------------------
;;;; The ratchet itself
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel cycles-within-recorded-state-test
  (testing (str "\nThe module dependency cycles in " module-cycles/modules-config-file " must stay within\n"
                "what " module-cycles/cycles-file " records.\n"
                "\n"
                ":escaped-modules -- a module joined an SCC, two SCCs merged, or a new SCC appeared.\n"
                "  Break the cycle. If it genuinely has to exist, `./bin/mage fix-module-cycles --seed`\n"
                "  and defend the widening in your PR.\n"
                ":edges -- new dependencies between modules that were already in a cycle together.\n"
                "  Cheaper to fix than it looks: these are usually one require.\n"
                ":newly-unconstrained -- a module started declaring `:uses :any`, which hides its\n"
                "  dependencies from this check entirely.\n"
                "\n"
                "Drift in the other direction (a cycle you broke) means `fix!` is broken, since the\n"
                "test fixture just ran it — unless you are in CI, where it does not run.")
    (is (= {}
           (module-cycles/drift (module-cycles/read-cycles)
                                (module-cycles/read-module-graph))))))

(deftest ^:parallel cycles-file-normalized-test
  (testing (str "\n" module-cycles/cycles-file " should be sorted and aligned exactly as the generator"
                " writes it.\nAfter a hand edit, run `./bin/mage fix-module-cycles` to normalize the formatting.")
    (is (= (module-cycles/render (module-cycles/read-cycles))
           (slurp module-cycles/cycles-file)))))

;;;; ---------------------------------------------------------------------------
;;;; Graph and cycle-detection unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel module-graph-test
  (let [config '{a {:uses #{b c}}
                 b {:uses #{c}}
                 c {}
                 d {:uses :any}}]
    (is (= '{a #{b c}, b #{c}, c #{}, d #{}}
           (module-cycles/module-graph config))
        "`:uses :any` contributes no edges, and a module with no `:uses` key gets an empty set")
    (is (= '#{d}
           (module-cycles/unconstrained-modules config)))))

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
    "2-module SCC (a, b)"           '#{b a}
    "3-module SCC (a, b, c)"        '#{c a b}
    "4-module SCC (a, b, c, ...)"   '#{d c b a}))

(deftest ^:parallel edges-within-test
  (let [graph '{a #{b c}, b #{a}, c #{}}]
    (is (= 3 (module-cycles/edges-within graph '#{a b c})))
    (is (= 2 (module-cycles/edges-within graph '#{a b})) "a->c does not count, c is outside")
    (is (= 0 (module-cycles/edges-within graph '#{c})))))

(deftest ^:parallel actual-state-test
  (is (= '#{{:modules #{a b}, :edges 2}}
         (module-cycles/actual-state '{a #{b}, b #{a}, c #{a}}))
      "only cyclic components are reported, and only edges between their own members are counted"))

;;;; ---------------------------------------------------------------------------
;;;; Ratchet bookkeeping unit tests
;;;; ---------------------------------------------------------------------------

(def ^:private recorded
  '{:sccs                  #{{:modules #{a b c}, :edges 4}}
    :unconstrained-modules #{z}})

(defn- drift-for [graph unconstrained]
  (module-cycles/drift recorded {:graph graph :unconstrained unconstrained}))

(deftest ^:parallel drift-accepts-improvements-test
  (are [graph] (= {} (drift-for graph '#{z}))
    ;; unchanged
    '{a #{b}, b #{c}, c #{a}, z #{}}
    ;; the SCC shrank
    '{a #{b}, b #{a}, c #{a}, z #{}}
    ;; the SCC is gone entirely
    '{a #{b}, b #{c}, c #{}, z #{}}
    ;; a module stopped declaring `:uses :any`
    '{a #{b}, b #{c}, c #{a}})
  (testing "an SCC that split into two smaller ones"
    (is (= {} (module-cycles/drift '{:sccs #{{:modules #{a b c d}, :edges 4}}}
                                   {:graph         '{a #{b}, b #{a}, c #{d}, d #{c}}
                                    :unconstrained #{}})))))

(deftest ^:parallel drift-rejects-regressions-test
  (testing "a module joining a recorded SCC"
    (is (= '{:escaped-modules #{a b c d}}
           (drift-for '{a #{b}, b #{c}, c #{d}, d #{a}, z #{}} '#{z}))))
  (testing "a brand new SCC between modules that were not in one"
    (is (= '{:escaped-modules #{x y}}
           (drift-for '{a #{b}, b #{c}, c #{a}, x #{y}, y #{x}, z #{}} '#{z}))))
  (testing "two recorded SCCs merging"
    (is (= '{:escaped-modules #{a b c d}}
           (module-cycles/drift '{:sccs #{{:modules #{a b}, :edges 2} {:modules #{c d}, :edges 2}}}
                                {:graph         '{a #{b}, b #{a c}, c #{d}, d #{c a}}
                                 :unconstrained #{}}))))
  (testing "new dependencies between modules already in the same SCC"
    (is (= {:edges {"3-module SCC (a, b, c)" {:recorded 4, :actual 6}}}
           (drift-for '{a #{b c}, b #{a c}, c #{a b}, z #{}} '#{z}))))
  (testing "a module newly hiding its dependencies behind `:uses :any`"
    (is (= '{:newly-unconstrained #{y}}
           (drift-for '{a #{b}, b #{c}, c #{a}, z #{}, y #{}} '#{y z})))))

(deftest ^:parallel tightened-only-narrows-test
  (testing "an SCC that shrank is re-recorded at its new size and edge count"
    (is (= '{:sccs                  #{{:modules #{a b}, :edges 2}}
             :unconstrained-modules #{}}
           (module-cycles/tightened recorded {:graph '{a #{b}, b #{a}, c #{a}}, :unconstrained #{}}))))
  (testing "an SCC that split is recorded as its pieces, each capped at the budget it came from"
    (is (= '{:sccs                  #{{:modules #{a b}, :edges 1} {:modules #{c d}, :edges 1}}
             :unconstrained-modules #{}}
           (module-cycles/tightened '{:sccs #{{:modules #{a b c d}, :edges 1}}}
                                    {:graph '{a #{b}, b #{a}, c #{d}, d #{c}}, :unconstrained #{}}))))
  (testing "an SCC that is gone is dropped"
    (is (= '{:sccs #{}, :unconstrained-modules #{}}
           (module-cycles/tightened recorded {:graph '{a #{b}, b #{}, c #{}}, :unconstrained #{}}))))
  (testing "a regression is left alone, so the ratchet still fails on it"
    (is (= recorded
           (module-cycles/tightened recorded
                                    {:graph         '{a #{b}, b #{c}, c #{d}, d #{a}}
                                     :unconstrained '#{z}}))
        "the grown SCC is not a subset of the recorded one, so nothing is re-recorded")))

(deftest ^:parallel seeded-widens-test
  (is (= '{:sccs                  #{{:modules #{a b c d}, :edges 4}}
           :unconstrained-modules #{z}}
         (module-cycles/seeded {:graph '{a #{b}, b #{c}, c #{d}, d #{a}}, :unconstrained '#{z}}))
      "--seed records whatever is there, which is the only way to widen"))

(deftest ^:parallel render-test
  (testing "the text round-trips losslessly and re-renders identically"
    (let [cycles '{:sccs                  #{{:modules #{b a}, :edges 3}}
                   :unconstrained-modules #{q p}}
          text   (module-cycles/render cycles)]
      (is (= cycles (edn/read-string text)))
      (is (= text (module-cycles/render (edn/read-string text))))))
  (testing "empty state"
    (is (str/ends-with? (module-cycles/render {:sccs #{}, :unconstrained-modules #{}})
                        "{:sccs\n #{}\n\n :unconstrained-modules\n #{}}\n"))))
