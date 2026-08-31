(ns metabase.dev.module-scc-test
  "Tests for module-graph SCC analysis."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.deps-graph :as deps-graph]
   [dev.module-scc :as module-scc]))

(set! *warn-on-reflection* true)

;; a -> b -> c -> a  (3-cycle), c -> d, e -> a, f isolated-ish (f -> d)
(def ^:private cyclic-graph
  '{a #{b}
    b #{c}
    c #{a d}
    d #{}
    e #{a}
    f #{d}})

(deftest ^:parallel strongly-connected-components-test
  (testing "decomposes into the 3-cycle plus singletons"
    (is (= #{'#{a b c} '#{d} '#{e} '#{f}}
           (set (deps-graph/strongly-connected-components cyclic-graph)))))
  (testing "nodes appearing only as successors are included"
    (is (contains? (set (deps-graph/strongly-connected-components '{a #{b}}))
                   '#{b})))
  (testing "an acyclic graph is all singletons"
    (is (every? #(= 1 (count %))
                (deps-graph/strongly-connected-components '{a #{b}, b #{c}, c #{}})))))

(deftest ^:parallel largest-scc-test
  (is (= '#{a b c} (deps-graph/largest-scc cyclic-graph))))

;; the 3-cycle above plus a disjoint 2-cycle, so the totals cover more than the largest component
(def ^:private two-cluster-graph
  (assoc cyclic-graph 'g '#{h}, 'h '#{g}))

(deftest ^:parallel cyclic-components-test
  (testing "only nontrivial components, largest first"
    (is (= ['#{a b c} '#{g h}] (deps-graph/cyclic-components two-cluster-graph))))
  (testing "equal-sized components order on their alphabetically first member, so runs are reproducible"
    (is (= ['#{g h} '#{y z}]
           (deps-graph/cyclic-components '{y #{z}, z #{y}, g #{h}, h #{g}}))))
  (testing "an acyclic graph has none"
    (is (= [] (deps-graph/cyclic-components '{a #{b}, b #{c}, c #{}})))))

(deftest ^:parallel cycle-stats-test
  (let [ns-counts '{a 4, b 3, c 2, d 9, e 9, f 9, g 1, h 1}
        stats     (deps-graph/cycle-stats two-cluster-graph ns-counts)]
    (testing "totals span every cyclic component, not just the largest"
      (is (= {:component-count 2
              :module-count    5
              :namespace-count 11
              :edge-count      5}
             (dissoc stats :components))))
    (testing "each component carries its own counts and members"
      ;; c -> d leaves the component and is not counted; a -> b -> c -> a are the three that stay inside
      (is (= [{:module-count 3, :namespace-count 9, :edge-count 3, :members '#{a b c}}
              {:module-count 2, :namespace-count 2, :edge-count 2, :members '#{g h}}]
             (:components stats)))))
  (testing "namespace counts default to zero for unweighted nodes"
    (is (= 0 (:namespace-count (deps-graph/cycle-stats two-cluster-graph {})))))
  (testing "an acyclic graph has nothing trapped"
    (is (= {:component-count 0, :module-count 0, :namespace-count 0, :edge-count 0, :components []}
           (deps-graph/cycle-stats '{a #{b}, b #{}} '{a 1, b 1})))))

(deftest ^:parallel model-import-dependencies-test
  (let [config '{collections {:model-exports #{:model/Collection}
                              :model-imports #{:model/Collection :model/Card}}
                 queries     {:model-exports #{:model/Card}
                              :model-imports #{:model/Database}}
                 serdes      {:model-imports :bypass}
                 warehouses  {:model-exports #{:model/Database}}}]
    (testing "an import becomes an edge to whichever module exports the model"
      (is (= '{collections #{queries}
               queries     #{warehouses}
               serdes      #{}
               warehouses  #{}}
             (deps-graph/model-import-dependencies config))))
    (testing "a module importing its own model is not made to depend on itself"
      (is (= #{'queries} (get (deps-graph/model-import-dependencies config) 'collections))))
    (testing "a bypass module declares no imports, so it contributes no edges"
      (is (= #{} (get (deps-graph/model-import-dependencies config) 'serdes))))))

(deftest ^:parallel empty-graph-scc-test
  (testing "a graph with no nodes has no SCC — largest-scc is empty rather than throwing"
    (is (= #{} (deps-graph/largest-scc {})))
    (is (= #{} (deps-graph/largest-scc {} []))))
  (testing "SCC summary and cut analyses handle degenerate graphs without throwing"
    ;; a node-cut of the sole node leaves an empty graph, so the internal `(apply max-key count sccs)`
    ;; must tolerate an empty SCC list rather than blowing up mid-analysis
    (is (= 0 (:largest-scc-size (module-scc/scc-summary {}))))
    (is (= 0 (:cyclic-edge-count (module-scc/scc-summary {}))))
    (is (= [] (module-scc/edge-cut-impacts {})))
    (is (seq (module-scc/node-cut-impacts '{a #{}})))))

(deftest ^:parallel scc-summary-cycle-totals-test
  (let [summary (module-scc/scc-summary two-cluster-graph '{a 4, b 3, c 2, g 1, h 1})]
    (testing "the largest component sizes only the worst blob"
      (is (= 3 (:largest-scc-size summary))))
    (testing "the cyclic totals cover the small cluster the largest-component numbers miss"
      (is (= {:cyclic-module-count 5, :cyclic-namespace-count 11, :cyclic-edge-count 5}
             (select-keys summary [:cyclic-module-count :cyclic-namespace-count :cyclic-edge-count]))))))

(deftest ^:parallel condensation-test
  (let [sccs (deps-graph/strongly-connected-components cyclic-graph)
        {:keys [node->scc graph]} (module-scc/condensation cyclic-graph sccs)]
    (testing "cycle members share an SCC id; the condensed graph has no self-edges"
      (is (= (node->scc 'a) (node->scc 'b) (node->scc 'c)))
      (is (every? (fn [[scc-id successors]] (not (contains? successors scc-id))) graph)))
    (testing "condensed edges follow the original cross-SCC edges"
      (is (contains? (get graph (node->scc 'c)) (node->scc 'd)))
      (is (contains? (get graph (node->scc 'e)) (node->scc 'a))))
    (testing "every SCC id — including sinks and isolated components — is a node in the condensed graph"
      (is (= (set (vals node->scc)) (set (keys graph))))
      ;; `d` is a sink (no outgoing cross-SCC edges); it must still appear with an empty successor set
      (is (contains? graph (node->scc 'd)))
      (is (= #{} (get graph (node->scc 'd)))))))

(deftest ^:parallel upstream-cut-impacts-test
  (testing "severing the cycle member's only back-edge dissolves the SCC"
    (let [impacts (module-scc/upstream-cut-impacts cyclic-graph)
          for-c   (first (filter #(= 'c (:module %)) impacts))]
      (is (= [['c 'a]] (:severed-edges for-c)))
      (is (= 1 (:new-largest-size for-c)))
      ;; when the giant dissolves entirely the arbitrary surviving "largest" singleton may itself be a
      ;; former member, so freed is 2 or 3
      (is (<= 2 (:num-freed for-c) 3)))))

(deftest ^:parallel leaf-cut-impacts-test
  (testing "severing in-SCC in-edges leaves out-of-SCC dependents (e) untouched"
    (let [impacts (module-scc/leaf-cut-impacts cyclic-graph)
          for-a   (first (filter #(= 'a (:module %)) impacts))]
      (is (= [['c 'a]] (:severed-edges for-a)))
      (is (= 1 (:new-largest-size for-a))))))

(deftest ^:parallel predicted-test-blast-radius-test
  (let [m->tests '{a #{"a1" "a2"}, b #{"b1"}, c #{"c1"}, d #{"d1"}, e #{"e1"}, f #{"f1"}}
        {:keys [per-module]} (module-scc/predicted-test-blast-radius cyclic-graph m->tests)]
    (testing "cycle members invalidate each other's tests plus dependents'"
      ;; a's dependents: b, c (cycle) + e => a1 a2 b1 c1 e1
      (is (= 5 (per-module 'a))))
    (testing "d is invalidated by everything upstream of it"
      ;; d's dependents: c (and via the cycle a, b), plus e and f => all 7 test files
      (is (= 7 (per-module 'd))))
    (testing "leaf-like e only invalidates its own tests"
      (is (= 1 (per-module 'e))))))

(deftest ^:parallel expected-tests-per-commit-test
  (let [m->tests     '{a #{"a1"}, d #{"d1"}, e #{"e1"}}
        file->module '{"src/a.clj" a, "src/e.clj" e}
        commits      [["src/a.clj"]                ; a => a's tests + dependents (b c e have only e tests) => a1 e1
                      ["src/e.clj"]                ; e alone => e1
                      ["frontend/x.tsx"]]          ; no module => skipped
        result       (module-scc/expected-tests-per-commit cyclic-graph m->tests file->module commits)]
    (is (= 3 (:num-commits result)))
    (is (= 1 (:num-commits-skipped result)))
    ;; nearest-rank p50 of [1 2] is the lower-middle value, matching dev.module-metrics
    (is (= 1 (:median result)))))

(deftest ^:parallel honest-test-selection-test
  (let [deps      [{:namespace 'x, :filename "src/x.clj", :deps [{:namespace 'y, :module 'm}]}
                   {:namespace 'y, :filename "src/y.clj", :deps []}]
        ;; z-test reaches y only through the shared helper, mimicking the metabase.test pattern;
        ;; y-test is defined in both the OSS and EE trees, mimicking the duplicated test-ns names
        test-info '{x-test {:files #{"test/x_test.clj"}, :requires #{x}}
                    y-test {:files #{"test/y_test.clj" "enterprise/backend/test/y_test.clj"}
                            :requires #{y}}
                    helper {:files #{"test/helper.clj"}, :requires #{y}}
                    z-test {:files #{"test/z_test.clj"}, :requires #{helper}}}]
    (testing "a test is selected for every namespace its own require closure reaches"
      (let [selection (module-scc/honest-test-selection deps test-info)]
        (is (= #{"test/x_test.clj"} (selection 'x)))
        (testing "and a duplicated test ns selects every file that defines it"
          (is (= #{"test/x_test.clj" "test/y_test.clj" "enterprise/backend/test/y_test.clj"
                   "test/helper.clj" "test/z_test.clj"}
                 (selection 'y))))))
    (testing ":narrow treats the helper as requiring nothing, so nothing selects through (or as) it"
      (let [selection (module-scc/honest-test-selection deps test-info {:narrow '#{helper}})]
        (is (= #{"test/x_test.clj" "test/y_test.clj" "enterprise/backend/test/y_test.clj"}
               (selection 'y)))))))

(deftest ^:parallel test-ns-info-merges-duplicate-namespaces-test
  (let [tmp-root (fn [label content]
                   (let [dir (.toFile (java.nio.file.Files/createTempDirectory
                                       (str "module-scc-" label)
                                       (make-array java.nio.file.attribute.FileAttribute 0)))
                         f   (io/file dir "dup_test.clj")]
                     (spit f content)
                     (.deleteOnExit f)
                     (.deleteOnExit dir)
                     dir))
        oss      (tmp-root "oss" "(ns dup-test (:require [x]))")
        ee       (tmp-root "ee" "(ns dup-test (:require [y]))")
        info     (module-scc/test-ns-info [oss ee])]
    (testing "the same ns in two roots keeps both files and the union of requires"
      (is (= {:files    #{(str (io/file oss "dup_test.clj")) (str (io/file ee "dup_test.clj"))}
              :requires '#{x y}}
             (info 'dup-test))))))

(deftest ^:parallel expected-tests-per-commit-at-ns-test
  (let [selection '{x #{"t1" "t2"}, y #{"t2"}}
        file->ns  '{"src/x.clj" x, "src/y.clj" y}
        commits   [["src/x.clj" "src/y.clj"]            ; union of x and y selections => 2
                   ["src/y.clj"]                        ; => 1
                   ["frontend/app.tsx"]]                ; no parsed ns => skipped
        result    (module-scc/expected-tests-per-commit-at-ns selection file->ns commits)]
    (is (= 3 (:num-commits result)))
    (is (= 1 (:num-commits-skipped result)))
    (is (= 1 (:median result)))
    (is (= 2 (:p90 result)))))

(deftest ^:parallel expected-tests-per-commit-percentile-test
  (testing "p90 uses nearest-rank semantics: rank ⌈0.9·10⌉ = 9 of 10, not the maximum"
    (let [m->tests     '{a #{"a1"}, e #{"e1"}}
          file->module '{"src/a.clj" a, "src/e.clj" e}
          ;; nine commits invalidating 1 test file, one invalidating 2 => counts [1×9 2]
          commits      (conj (vec (repeat 9 ["src/e.clj"])) ["src/a.clj"])
          result       (module-scc/expected-tests-per-commit cyclic-graph m->tests file->module commits)]
      (is (= 1 (:median result)))
      (is (= 1 (:p90 result))))))
