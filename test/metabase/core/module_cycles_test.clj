(ns metabase.core.module-cycles-test
  "Ratchet on circular dependencies between modules. See [[dev.module-cycles]]."
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
  (testing (str "\nYou added a dependency cycle between modules. Each entry below is one SCC, keyed\n"
                "by its (meaningless) name:\n"
                "  :modules-added   -- modules that just joined it. Usually the thing to look at.\n"
                "  :modules-removed -- modules that left, for context.\n"
                "  :edges-recorded / :edges-actual -- dependencies between members, then and now.\n"
                "  :new-cycle?      -- no such SCC existed before.\n"
                "\n"
                "A regression under :uses+model-imports but not :uses means you added a `:model/X`\n"
                "reference rather than a require -- no new require, but the module can no longer be\n"
                "loaded without the model's module.\n"
                "\n"
                "Break the cycle, or accept it with `./bin/mage fix-module-cycles --seed` and say why\n"
                "in your PR. If the widening came from master rather than your branch, say that too.\n"
                "See dev/src/dev/module_cycles.clj for what the graphs measure.")
    (is (= {}
           (module-cycles/drift (module-cycles/read-cycles)
                                (module-cycles/read-module-graphs))))))

(deftest ^:parallel cycles-file-normalized-test
  (testing (str "\n" module-cycles/cycles-file " should be sorted and aligned exactly as the generator"
                " writes it.\nAfter a hand edit, run `./bin/mage fix-module-cycles` to normalize the formatting.")
    (is (= (module-cycles/render (module-cycles/read-cycles))
           (slurp module-cycles/cycles-file)))))

(deftest ^:parallel every-recorded-scc-is-named-test
  (testing (str "\nEvery recorded SCC needs a name for failures to be readable. A missing one means a\n"
                "hand edit; run `./bin/mage fix-module-cycles` to mint it.")
    (let [recorded (module-cycles/read-cycles)
          names    (for [k module-cycles/graph-keys
                         scc (get-in recorded [k :sccs])]
                     (:name scc))]
      (is (every? string? names))
      (is (apply distinct? "sentinel" names) "names are unique"))))

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
;;;; Naming
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel generate-name-test
  (is (re-matches #"[a-z]+-[a-z]+" (module-cycles/generate-name #{})))
  (testing "never collides with a name already in use"
    (let [taken (set (repeatedly 300 #(module-cycles/generate-name #{})))]
      (is (not (contains? taken (module-cycles/generate-name taken)))))))

(def ^:private four-scc
  '{:name "old-name", :modules #{a b c d}, :edges 4})

(deftest ^:parallel incumbent-test
  (testing "a majority of the recorded modules staying together is what inherits"
    (are [expected modules] (= expected (:name (module-cycles/incumbent #{four-scc} modules)))
      "old-name" '#{a b c d}       ; unchanged
      "old-name" '#{a b c d e}     ; grew
      "old-name" '#{a b c}         ; shrank, still a majority
      nil        '#{a b}           ; exactly half is not a majority
      nil        '#{a}             ; below half
      nil        '#{x y}))         ; unrelated
  (testing "an even split leaves both halves unnamed, so there is no tie to break"
    (is (nil? (module-cycles/incumbent #{four-scc} '#{a b})))
    (is (nil? (module-cycles/incumbent #{four-scc} '#{c d}))))
  (testing "a merge is the one case with several candidates; the largest wins"
    (let [recorded '#{{:name "big", :modules #{a b c}, :edges 3}
                      {:name "small", :modules #{d e}, :edges 2}}]
      (is (= "big" (:name (module-cycles/incumbent recorded '#{a b c d e})))))))

(deftest ^:parallel named-sccs-test
  (testing "a surviving SCC keeps its name"
    (is (= #{"old-name"}
           (into #{} (map :name) (module-cycles/named-sccs #{four-scc} '#{{:modules #{a b c}, :edges 3}})))))
  (testing "a split gives the majority piece the old name and the minority a fresh one"
    (let [named (module-cycles/named-sccs #{four-scc}
                                          '#{{:modules #{a b c}, :edges 3}
                                             {:modules #{d e}, :edges 2}})
          by-modules (into {} (map (juxt :modules :name)) named)]
      (is (= "old-name" (get by-modules '#{a b c})))
      (is (not= "old-name" (get by-modules '#{d e})))
      (is (string? (get by-modules '#{d e})))))
  (testing "an even split gives both halves fresh names, since neither holds a majority"
    (let [names (map :name (module-cycles/named-sccs #{four-scc}
                                                     '#{{:modules #{a b}, :edges 2}
                                                        {:modules #{c d}, :edges 2}}))]
      (is (not-any? #{"old-name"} names))
      (is (apply distinct? names) "minted names are still distinct from each other")))
  (testing "a fresh name never reuses a recorded one, so it cannot look like a rename"
    (let [recorded '#{{:name "gone", :modules #{q r s t}, :edges 4}}
          named    (module-cycles/named-sccs recorded '#{{:modules #{x y}, :edges 2}})]
      (is (not= "gone" (:name (first named)))))))

;;;; ---------------------------------------------------------------------------
;;;; Ratchet bookkeeping
;;;; ---------------------------------------------------------------------------

(def ^:private recorded
  '{:uses                  {:sccs #{{:name "quiet-vale", :modules #{a b c}, :edges 4}}}
    :uses+model-imports    {:sccs #{{:name "tidal-grove", :modules #{a b c}, :edges 4}}}
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
    (let [recorded '{:uses                  {:sccs #{{:name "n", :modules #{a b c d}, :edges 4}}}
                     :uses+model-imports    {:sccs #{{:name "m", :modules #{a b c d}, :edges 4}}}
                     :unconstrained-modules {:uses #{z}, :model-imports #{}}}]
      (is (= {} (module-cycles/drift recorded (state '{a #{b}, b #{a}, c #{d}, d #{c}})))))))

(deftest ^:parallel drift-names-what-changed-test
  (testing "a module joining a recorded SCC is reported by name, with the modules and edge delta"
    (is (= {:uses               {"quiet-vale"  {:edges-recorded 4, :edges-actual 4
                                                :modules-added '#{d}}}
            :uses+model-imports {"tidal-grove" {:edges-recorded 4, :edges-actual 4
                                                :modules-added '#{d}}}}
           (module-cycles/drift recorded (state '{a #{b}, b #{c}, c #{d}, d #{a}, z #{}})))))
  (testing "modules that left are reported too, for context"
    (is (= '#{d} (get-in (module-cycles/drift recorded (state '{a #{b}, b #{d}, d #{a}, c #{}, z #{}}))
                         [:uses "quiet-vale" :modules-added])))
    (is (= '#{c} (get-in (module-cycles/drift recorded (state '{a #{b}, b #{d}, d #{a}, c #{}, z #{}}))
                         [:uses "quiet-vale" :modules-removed]))))
  (testing "a brand new SCC is flagged as such, since there is no incumbent to diff against"
    (let [d (:uses (module-cycles/drift recorded (state '{a #{b}, b #{c}, c #{a}, x #{y}, y #{x}, z #{}})))]
      (is (= 1 (count d)))
      (is (= {:edges-recorded 0, :edges-actual 2, :modules-added '#{x y}, :new-cycle? true}
             (val (first d))))))
  (testing "more edges between modules already in the SCC"
    (is (= {:uses               {"quiet-vale"  {:edges-recorded 4, :edges-actual 6}}
            :uses+model-imports {"tidal-grove" {:edges-recorded 4, :edges-actual 6}}}
           (module-cycles/drift recorded (state '{a #{b c}, b #{a c}, c #{a b}, z #{}})))))
  (testing "a module newly hiding its dependencies behind `:model-imports :bypass`"
    (is (= '{:newly-unconstrained {:model-imports #{q}}}
           (module-cycles/drift recorded
                                {:graphs        {:uses               '{a #{b}, b #{c}, c #{a}, z #{}}
                                                 :uses+model-imports '{a #{b}, b #{c}, c #{a}, z #{}}}
                                 :unconstrained {:uses '#{z}, :model-imports '#{q}}})))))

(deftest ^:parallel drift-reports-graphs-independently-test
  (testing "a new model reference regresses only the graph that can see it"
    (is (= {:uses+model-imports {"tidal-grove" {:edges-recorded 4, :edges-actual 4
                                                :modules-added '#{d}}}}
           (module-cycles/drift recorded
                                (state '{a #{b}, b #{c}, c #{a}, d #{}, z #{}}
                                       '{a #{b}, b #{c}, c #{d}, d #{a}, z #{}})))
        "this is exactly the regression a require-only ratchet waves through")))

(deftest ^:parallel tightened-only-narrows-test
  (testing "an SCC that shrank keeps its name and is re-recorded smaller"
    (is (= '#{{:name "quiet-vale", :modules #{a b}, :edges 2}}
           (get-in (module-cycles/tightened recorded (state '{a #{b}, b #{a}, c #{a}, z #{}}))
                   [:uses :sccs]))))
  (testing "an SCC that split is recorded as its pieces, each capped at the budget it came from"
    (let [recorded '{:uses {:sccs #{{:name "n", :modules #{a b c d}, :edges 1}}}}
          sccs     (get-in (module-cycles/tightened recorded (state '{a #{b}, b #{a}, c #{d}, d #{c}}))
                           [:uses :sccs])]
      (is (= '#{#{a b} #{c d}} (into #{} (map :modules) sccs)))
      (is (every? #(= 1 (:edges %)) sccs))
      (is (not-any? #{"n"} (map :name sccs))
          "an even split is nobody's continuation, so both halves are renamed")))
  (testing "a lopsided split lets the majority piece keep the name"
    (let [recorded '{:uses {:sccs #{{:name "n", :modules #{a b c d}, :edges 4}}}}
          sccs     (get-in (module-cycles/tightened
                            recorded
                            (state '{a #{b}, b #{c}, c #{a}, d #{}}))
                           [:uses :sccs])]
      (is (= '#{#{a b c}} (into #{} (map :modules) sccs)))
      (is (= #{"n"} (into #{} (map :name) sccs)))))
  (testing "an SCC that is gone is dropped"
    (is (= #{} (get-in (module-cycles/tightened recorded (state '{a #{b}, b #{}, c #{}, z #{}}))
                       [:uses :sccs]))))
  (testing "a regression is left alone, so the ratchet still fails on it"
    (is (= '#{{:name "quiet-vale", :modules #{a b c}, :edges 4}}
           (get-in (module-cycles/tightened recorded (state '{a #{b}, b #{c}, c #{d}, d #{a}, z #{}}))
                   [:uses :sccs]))
        "the grown SCC is not a subset of the recorded one, so nothing is re-recorded")))

(deftest ^:parallel seeded-widens-test
  (let [seeded (module-cycles/seeded recorded (state '{a #{b}, b #{c}, c #{d}, d #{a}}))]
    (is (= '#{#{a b c d}} (into #{} (map :modules) (get-in seeded [:uses :sccs])))
        "--seed records whatever is there, which is the only way to widen")
    (is (= #{"quiet-vale"} (into #{} (map :name) (get-in seeded [:uses :sccs])))
        "and the grown SCC keeps its name, so the diff reads as a change rather than a replacement")))

(deftest ^:parallel render-test
  (testing "the text round-trips losslessly and re-renders identically"
    (let [cycles '{:uses                  {:sccs #{{:name "one", :modules #{b a}, :edges 3}}}
                   :uses+model-imports    {:sccs #{{:name "two", :modules #{c b a}, :edges 5}}}
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
