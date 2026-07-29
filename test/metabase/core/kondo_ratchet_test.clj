(ns metabase.core.kondo-ratchet-test
  "Ratchet on inline kondo ignore forms: budgets live in `.clj-kondo/ratchets.edn` and only move down.
  The ignore forms in this file are string fixtures — the scanner masks string literals, so they don't
  count as suppressions."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]))

(set! *warn-on-reflection* true)

;; Outside CI, tighten the ratchets before asserting — the fix rides along in your next commit.
;; The self-heal workflow does the same for labelled PRs.
(use-fixtures :once (fn [thunk]
                      (when-not (System/getenv "CI")
                        (kondo-ratchet/fix!))
                      (thunk)))

;;;; ---------------------------------------------------------------------------
;;;; The ratchets themselves
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel budgets-match-actual-counts-test
  (testing (str "\nBudgets in " kondo-ratchet/ratchets-file " must match the actual inline ignore counts.\n"
                "Budget too low: remove an ignore, or seed the budget with\n"
                "`./bin/mage fix-kondo-ratchets --seed <linter>` and defend it in the PR.\n"
                "Budget too high: run `./bin/mage fix-kondo-ratchets`, or label the PR\n"
                "kondo-ratchets-self-healing and CI commits the fix to your branch. Too high in a local\n"
                "run means `fix!` itself is broken, since the test fixture just ran it.")
    (is (= {}
           (kondo-ratchet/drift (:ignore-counts (kondo-ratchet/read-ratchets))
                                (kondo-ratchet/scan))))))

(deftest ^:parallel ratchets-file-normalized-test
  (testing (str "\n" kondo-ratchet/ratchets-file " should be sorted and aligned exactly as the generator"
                " writes it.\nAfter a hand edit, run `./bin/mage fix-kondo-ratchets` to normalize the formatting.")
    (is (= (kondo-ratchet/render (kondo-ratchet/read-ratchets))
           (slurp kondo-ratchet/ratchets-file)))))

;;;; ---------------------------------------------------------------------------
;;;; Scanner unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel mask-strings-and-comments-test
  (are [expected content] (= expected (kondo-ratchet/mask-strings-and-comments content))
    "(f \"     \" x)"        "(f \"a ; b\" x)"
    "(f)      \n(g)"         "(f) ; hey\n(g)"
    "(f \"   \n  \")"        "(f \"a b\nc \")"
    ;; escaped quote stays inside the string; char literals never open one
    "(f \"      \")"         "(f \"a\\\"b c\")"
    "[\\\" \"   \"]"         "[\\\" \"abc\"]")
  (testing "masking preserves length and newline positions"
    (let [content "(f \"a\nb\") ; c\n(g)"
          masked  (kondo-ratchet/mask-strings-and-comments content)]
      (is (= (count content) (count masked)))
      (is (= [5 13] (keep-indexed #(when (= %2 \newline) %1) masked))))))

(deftest ^:parallel line-linters-test
  (are [expected line] (= expected (kondo-ratchet/line-linters line))
    [:discouraged-var]  "  #_{:clj-kondo/ignore [:discouraged-var]}"
    [:a :b]             "#_{:clj-kondo/ignore [:a :b]}"
    [:a :b :c]          "#_{:clj-kondo/ignore [:a :b]} x #_{:clj-kondo/ignore [:c]}"
    [:metabase/modules] "   ^{:clj-kondo/ignore [:metabase/modules]}"
    [:deprecated-var]   "#_ {:clj-kondo/ignore [:deprecated-var]} (old-fn)"
    [:attr-map]         "(ns b {:clj-kondo/ignore [:attr-map]})"
    [:extra]            "#_{:clj-kondo/ignore [:extra] :reason 1}"
    ;; vector-less forms suppress everything -> :all
    [:all]              "  #_:clj-kondo/ignore"
    [:all]              "  #_ :clj-kondo/ignore (foo)"
    [:all]              "  ^:clj-kondo/ignore (foo)"
    ;; lookalikes that must NOT count
    []                  "#_:clj-kondo/ignore-my-advice"
    []                  "(defn foo [x] (inc x))"
    ;; ignore forms inside strings and comments don't count either
    []                  "(def s \"#_{:clj-kondo/ignore [:in-a-string]}\")"
    []                  ";; #_{:clj-kondo/ignore [:commented-out]}"))

(deftest ^:parallel scan-test
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory
                      "kondo-ratchet-test"
                      (make-array java.nio.file.attribute.FileAttribute 0)))]
    (spit (io/file dir "a.clj")
          (str "(ns a)\n"
               "#_{:clj-kondo/ignore [:x :y]}\n"
               "(defn f [] 1)\n"
               ";; g is only used from the REPL\n"
               "#_:clj-kondo/ignore\n"
               "(defn g [] 2)\n"
               "(def h \"docstring with #_{:clj-kondo/ignore [:in-a-string]}\" 3)\n"
               "#_{:clj-kondo/ignore [:multi\n"
               "                      :line]}\n"
               "(defn i [] 4) #_{:clj-kondo/ignore [:trailing]} ;; trailing needs suppressing here\n"
               ";; #_{:clj-kondo/ignore [:commented-out]}\n"
               "(defn j [] 5)\n"))
    (spit (io/file dir "b.clj")
          (str "(ns b {:clj-kondo/ignore [:attr-map]})\n"
               "#_{:clj-kondo/ignore [:extra] :reason \"legacy\"}\n"
               "(defn k [] 6)\n"))
    (let [occurrences (sort-by (juxt :file :line) (kondo-ratchet/scan [(.getPath dir)]))]
      (is (= [{:file (.getPath (io/file dir "a.clj")), :line 2,  :linters [:x :y]}
              {:file (.getPath (io/file dir "a.clj")), :line 5,  :linters [:all]}
              {:file (.getPath (io/file dir "a.clj")), :line 8,  :linters [:multi :line]}
              {:file (.getPath (io/file dir "a.clj")), :line 10, :linters [:trailing]}
              {:file (.getPath (io/file dir "b.clj")), :line 1,  :linters [:attr-map]}
              {:file (.getPath (io/file dir "b.clj")), :line 2,  :linters [:extra]}]
             occurrences)
          "strings and commented-out forms don't count; multi-line vectors, attr-maps, and extra keys do")
      (is (= {:x 1, :y 1, :all 1, :multi 1, :line 1, :trailing 1, :attr-map 1, :extra 1}
             (kondo-ratchet/actual-counts occurrences))))))

;;;; ---------------------------------------------------------------------------
;;;; Budget bookkeeping unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel render-test
  (testing "keys come out sorted, values aligned, and the text round-trips losslessly"
    (let [ratchets {:ignore-counts {:discouraged-var 3, :all 1, :metabase/modules 2}}
          text     (kondo-ratchet/render ratchets)]
      (is (str/ends-with? text (str "{:ignore-counts {:all              1\n"
                                    "                 :discouraged-var  3\n"
                                    "                 :metabase/modules 2}}\n")))
      (is (= ratchets (edn/read-string text)))
      (is (= text (kondo-ratchet/render (edn/read-string text))))))
  (testing "empty ratchets"
    (is (str/ends-with? (kondo-ratchet/render {:ignore-counts {}})
                        "{:ignore-counts {}}\n"))))

(deftest ^:parallel lowered-counts-test
  (is (= {:lower 3, :over-budget 5}
         (kondo-ratchet/lowered-counts {:lower 5, :over-budget 5, :gone 5}
                                       {:lower 3, :over-budget 7, :new-linter 9}
                                       []))
      "budgets only ever move down: :lower shrinks to actual, :over-budget stays (the test's business),
       :gone is dropped, :new-linter is not added")
  (testing "seeding is the escape hatch: sets the budget to actual, adding or raising"
    (is (= {:new-linter 9, :raised 7}
           (kondo-ratchet/lowered-counts {:raised 5}
                                         {:new-linter 9, :raised 7}
                                         [:new-linter :raised])))
    (is (= {}
           (kondo-ratchet/lowered-counts {} {} [:nothing-to-seed]))
        "seeding a linter with no ignores adds nothing")))

(deftest ^:parallel drift-test
  (let [occurrences [{:file "f.clj", :line 1, :linters [:a]}
                     {:file "f.clj", :line 2, :linters [:a :b]}
                     {:file "g.clj", :line 3, :linters [:c]}]]
    (is (= {:a    {:recorded 1, :actual 2, :examples ["f.clj:1" "f.clj:2"]}
            :b    {:recorded 0, :actual 1, :examples ["f.clj:2"]}
            :c    {:recorded 9, :actual 1}
            :gone {:recorded 3, :actual 0}}
           (kondo-ratchet/drift {:a 1, :c 9, :gone 3} occurrences))
        ":a and :b are over budget (with examples); :c and :gone are stale (without)"))
  (testing "a matching budget doesn't appear"
    (is (= {} (kondo-ratchet/drift {:a 1} [{:file "f.clj", :line 1, :linters [:a]}]))))
  (testing "examples are capped at 5"
    (let [occurrences (for [line (range 1 10)]
                        {:file "f.clj", :line line, :linters [:a]})]
      (is (= 5 (count (:examples (:a (kondo-ratchet/drift {} occurrences)))))))))

(deftest ^:parallel change-report-test
  (let [occurrences (for [[linter n] {:lower 3, :over 7, :new 9, :same 4}
                          i          (range n)]
                      {:file "f.clj", :line (inc i), :linters [linter]})]
    (is (= ["seeded :new at 9"
            "WARNING: :void has no inline ignores -- nothing to seed"
            "dropped :gone (no ignores left)"
            "lowered :lower 5 -> 3"
            "WARNING: :over is over budget (5 recorded, 7 actual) -- remove ignores, or accept them all with `--seed :over`"]
           (kondo-ratchet/change-report {:ignore-counts {:lower 5, :over 5, :gone 5, :same 4}}
                                        occurrences
                                        [:new :void]))
        "an untouched budget (:same) earns no line")))
