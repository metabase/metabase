(ns metabase.core.kondo-ratchet-test
  "Ratchet on inline kondo ignore forms: budgets live in `.clj-kondo/ratchets.edn` and only move down.
  This file is in [[dev.kondo-ratchet]]'s exclusion list: the ignore forms below are fixtures, not
  suppressions."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]))

(set! *warn-on-reflection* true)

;;;; ---------------------------------------------------------------------------
;;;; The ratchet itself
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel no-ignore-budget-exceeded-test
  (testing (str "\nEach linter's inline ignore count must stay within its budget in "
                kondo-ratchet/ratchets-file "\n"
                "To fix: remove an ignore for the over-budget linter, or — if the new ignore is genuinely\n"
                "needed — raise its budget by hand and defend the increase in the PR.\n"
                "(`./bin/mage fix-kondo-ratchets` only lowers budgets; a linter with no entry has budget 0.)")
    (is (= []
           (kondo-ratchet/over-budget (:ignore-counts (kondo-ratchet/read-ratchets))
                                      (kondo-ratchet/scan))))))

(deftest ^:parallel budgets-are-tight-locally-test
  ;; CI allows slack: the kondo-ratchets-update workflow lowers budgets on master after each merge, so PRs
  ;; that remove ignores don't have to touch the file. Locally the fix is instant, so keep the file tight.
  (when-not (System/getenv "CI")
    (testing (str "\nBudgets in " kondo-ratchet/ratchets-file " exceed the actual ignore counts.\n"
                  "Run `./bin/mage fix-kondo-ratchets` to tighten them (takes a couple of seconds).")
      (let [recorded  (:ignore-counts (kondo-ratchet/read-ratchets))
            tightened (kondo-ratchet/lowered-counts recorded (kondo-ratchet/actual-counts (kondo-ratchet/scan)))]
        (is (= {}
               (into {}
                     (keep (fn [[linter budget]]
                             (when (not= budget (get tightened linter 0))
                               [linter {:recorded budget, :should-be (get tightened linter 0)}])))
                     recorded)))))))

(deftest ^:parallel ratchets-file-normalized-test
  (testing (str "\n" kondo-ratchet/ratchets-file " should be sorted and aligned exactly as the generator"
                " writes it.\nAfter a hand edit, run `./bin/mage fix-kondo-ratchets` to normalize the formatting.")
    (is (= (kondo-ratchet/render (:ignore-counts (kondo-ratchet/read-ratchets)))
           (slurp kondo-ratchet/ratchets-file)))))

;;;; ---------------------------------------------------------------------------
;;;; Scanner unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel line-linters-test
  (are [expected line] (= expected (kondo-ratchet/line-linters line))
    [:discouraged-var]  "  #_{:clj-kondo/ignore [:discouraged-var]}"
    [:a :b]             "#_{:clj-kondo/ignore [:a :b]}"
    [:a :b :c]          "#_{:clj-kondo/ignore [:a :b]} x #_{:clj-kondo/ignore [:c]}"
    [:metabase/modules] "   ^{:clj-kondo/ignore [:metabase/modules]}"
    [:deprecated-var]   "#_ {:clj-kondo/ignore [:deprecated-var]} (old-fn)"
    ;; vector-less forms suppress everything -> :all
    [:all]              "  #_:clj-kondo/ignore"
    [:all]              "  #_ :clj-kondo/ignore (foo)"
    [:all]              "  ^:clj-kondo/ignore (foo)"
    ;; lookalikes that must NOT count
    []                  "\"prose mentioning :clj-kondo/ignore in a string\""
    []                  "#_:clj-kondo/ignore-my-advice"
    []                  "(defn foo [x] (inc x))"))

(deftest ^:parallel scan-test
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory
                      "kondo-ratchet-test"
                      (make-array java.nio.file.attribute.FileAttribute 0)))]
    (spit (io/file dir "a.clj") (str "(ns a)\n"
                                     "#_{:clj-kondo/ignore [:x :y]}\n"
                                     "(defn f [] 1)\n"
                                     "#_:clj-kondo/ignore\n"
                                     "(defn g [] 2)\n"))
    (spit (io/file dir "b.clj") "(ns b)\n(defn h [] 3)\n")
    (spit (io/file dir "c.txt") "#_{:clj-kondo/ignore [:not-a-clojure-file]}\n")
    (let [occurrences (kondo-ratchet/scan [(.getPath dir)])]
      (is (= [{:file (.getPath (io/file dir "a.clj")), :line 2, :linters [:x :y]}
              {:file (.getPath (io/file dir "a.clj")), :line 4, :linters [:all]}]
             occurrences))
      (is (= {:x 1, :y 1, :all 1}
             (kondo-ratchet/actual-counts occurrences))))))

;;;; ---------------------------------------------------------------------------
;;;; Budget bookkeeping unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel render-test
  (testing "keys come out sorted, values aligned, and the text round-trips losslessly"
    (let [counts {:discouraged-var 3, :all 1, :metabase/modules 2}
          text   (kondo-ratchet/render counts)]
      (is (str/ends-with? text (str "{:ignore-counts {:all              1\n"
                                    "                 :discouraged-var  3\n"
                                    "                 :metabase/modules 2}}\n")))
      (is (= {:ignore-counts counts} (edn/read-string text)))
      (is (= text (kondo-ratchet/render (:ignore-counts (edn/read-string text)))))))
  (testing "empty budgets"
    (is (str/ends-with? (kondo-ratchet/render {}) "{:ignore-counts {}}\n"))))

(deftest ^:parallel lowered-counts-test
  (is (= {:lower 3, :over-budget 5}
         (kondo-ratchet/lowered-counts {:lower 5, :over-budget 5, :gone 5}
                                       {:lower 3, :over-budget 7, :new-linter 9}))
      "budgets only ever move down: :lower shrinks to actual, :over-budget stays (the test's business),
       :gone is dropped, :new-linter is not added"))

(deftest ^:parallel over-budget-test
  (let [occurrences [{:file "f.clj", :line 1, :linters [:a]}
                     {:file "f.clj", :line 2, :linters [:a :b]}
                     {:file "g.clj", :line 3, :linters [:c]}]]
    (is (= [{:linter :a, :recorded 1, :actual 2, :examples ["f.clj:1" "f.clj:2"]}
            {:linter :b, :recorded 0, :actual 1, :examples ["f.clj:2"]}]
           (kondo-ratchet/over-budget {:a 1, :c 9} occurrences))
        ":a exceeds its budget, :b has no budget entry (= 0), :c is under budget"))
  (testing "examples are capped at 5"
    (let [occurrences (for [line (range 1 10)]
                        {:file "f.clj", :line line, :linters [:a]})]
      (is (= 5 (count (:examples (first (kondo-ratchet/over-budget {} occurrences)))))))))

(deftest ^:parallel change-report-test
  (is (= ["dropped :gone (no ignores left)"
          "lowered :lower 5 -> 3"
          "WARNING: :over is over budget (5 recorded, 7 actual) -- remove ignores or raise the budget by hand"
          "WARNING: :new has 9 ignores but no budget entry -- add one by hand"]
         (kondo-ratchet/change-report {:lower 5, :over 5, :gone 5, :same 4}
                                      {:lower 3, :over 7, :new 9, :same 4}))
      "an untouched budget (:same) earns no line"))
