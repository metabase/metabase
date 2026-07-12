(ns metabase.dev.module-scc-test
  "Tests for module-graph SCC analysis."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
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

(deftest strongly-connected-components-test
  (testing "decomposes into the 3-cycle plus singletons"
    (is (= #{'#{a b c} '#{d} '#{e} '#{f}}
           (set (module-scc/strongly-connected-components cyclic-graph)))))
  (testing "nodes appearing only as successors are included"
    (is (contains? (set (module-scc/strongly-connected-components '{a #{b}}))
                   '#{b})))
  (testing "an acyclic graph is all singletons"
    (is (every? #(= 1 (count %))
                (module-scc/strongly-connected-components '{a #{b}, b #{c}, c #{}})))))

(deftest largest-scc-test
  (is (= '#{a b c} (module-scc/largest-scc cyclic-graph))))

(deftest condensation-test
  (let [sccs (module-scc/strongly-connected-components cyclic-graph)
        {:keys [node->scc graph]} (module-scc/condensation cyclic-graph sccs)]
    (testing "cycle members share an SCC id; the condensed graph has no self-edges"
      (is (= (node->scc 'a) (node->scc 'b) (node->scc 'c)))
      (is (every? (fn [[scc-id successors]] (not (contains? successors scc-id))) graph)))
    (testing "condensed edges follow the original cross-SCC edges"
      (is (contains? (get graph (node->scc 'c)) (node->scc 'd)))
      (is (contains? (get graph (node->scc 'e)) (node->scc 'a))))))

(deftest upstream-cut-impacts-test
  (testing "severing the cycle member's only back-edge dissolves the SCC"
    (let [impacts (module-scc/upstream-cut-impacts cyclic-graph)
          for-c   (first (filter #(= 'c (:module %)) impacts))]
      (is (= [['c 'a]] (:severed-edges for-c)))
      (is (= 1 (:new-largest-size for-c)))
      ;; when the giant dissolves entirely the arbitrary surviving "largest" singleton may itself be a
      ;; former member, so freed is 2 or 3
      (is (<= 2 (:num-freed for-c) 3)))))

(deftest leaf-cut-impacts-test
  (testing "severing in-SCC in-edges leaves out-of-SCC dependents (e) untouched"
    (let [impacts (module-scc/leaf-cut-impacts cyclic-graph)
          for-a   (first (filter #(= 'a (:module %)) impacts))]
      (is (= [['c 'a]] (:severed-edges for-a)))
      (is (= 1 (:new-largest-size for-a))))))

(deftest predicted-test-blast-radius-test
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

(deftest expected-tests-per-commit-test
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

(deftest honest-test-selection-test
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

(deftest test-ns-info-merges-duplicate-namespaces-test
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

(deftest expected-tests-per-commit-at-ns-test
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

(deftest expected-tests-per-commit-percentile-test
  (testing "p90 uses nearest-rank semantics: rank ⌈0.9·10⌉ = 9 of 10, not the maximum"
    (let [m->tests     '{a #{"a1"}, e #{"e1"}}
          file->module '{"src/a.clj" a, "src/e.clj" e}
          ;; nine commits invalidating 1 test file, one invalidating 2 => counts [1×9 2]
          commits      (conj (vec (repeat 9 ["src/e.clj"])) ["src/a.clj"])
          result       (module-scc/expected-tests-per-commit cyclic-graph m->tests file->module commits)]
      (is (= 1 (:median result)))
      (is (= 1 (:p90 result))))))
