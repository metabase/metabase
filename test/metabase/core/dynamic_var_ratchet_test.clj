(ns metabase.core.dynamic-var-ratchet-test
  "Ratchet on `^:dynamic` var definitions in backend src: per-file budgets live in
  `dev/dynamic-var-ratchet.edn` and only move down. Dynamic vars are hidden function inputs —
  they defeat local reasoning, break across thread hops, and force every reader (human or agent)
  to reconstruct the call stack. New code threads explicit arguments (or a ctx map) instead."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [dev.dynamic-var-ratchet :as dvr]))

(set! *warn-on-reflection* true)

;; Outside CI, tighten the budgets before asserting — the fix rides along in your next commit.
(use-fixtures :once (fn [thunk]
                      (when-not (System/getenv "CI")
                        (dvr/fix!))
                      (thunk)))

(deftest ^:parallel no-new-dynamic-vars-test
  (testing (str "\nBudgets in " dvr/budgets-file " must match the actual `^:dynamic` counts per file.\n"
                "Over budget: you added a dynamic var — thread an explicit argument (or ctx map)\n"
                "instead. If it is genuinely required (REPL tooling, library interop), run\n"
                "(dev.dynamic-var-ratchet/seed!) and defend the diff in your PR.\n"
                "Under budget in CI: run the test locally (it tightens the file) and commit the change.")
    (is (= {}
           (dvr/drift (dvr/read-budgets) (dvr/scan))))))

;;;; ---------------------------------------------------------------------------
;;;; Scanner unit tests
;;;; ---------------------------------------------------------------------------

(defn- temp-dir ^java.io.File []
  (.toFile (java.nio.file.Files/createTempDirectory
            "dynamic-var-ratchet-test"
            (make-array java.nio.file.attribute.FileAttribute 0))))

(deftest ^:parallel scan-test
  (let [dir (temp-dir)]
    (spit (io/file dir "a.clj")
          (str "(ns a)\n"
               "(def ^:dynamic *foo* nil)\n"
               "(def ^:private ^:dynamic *bar* nil)\n"
               "(def ^{:dynamic true :doc \"long form\"} *baz* nil)\n"
               "(def plain \"a docstring mentioning ^:dynamic\" 1)\n"
               ";; commented out: (def ^:dynamic *gone* nil)\n"
               "(def ^:dynamically-scoped-not-really x 1)\n"))
    (spit (io/file dir "b.cljc")
          "(ns b)\n(def ^:dynamic *qux* nil)\n")
    (spit (io/file dir "c.cljs")
          "(ns c)\n(def ^:dynamic *ignored-file-type* nil)\n")
    (is (= [{:file (.getPath (io/file dir "a.clj")), :line 2}
            {:file (.getPath (io/file dir "a.clj")), :line 3}
            {:file (.getPath (io/file dir "a.clj")), :line 4}
            {:file (.getPath (io/file dir "b.cljc")), :line 2}]
           (sort-by (juxt :file :line) (dvr/scan [(.getPath dir)])))
        "docstrings, comments, lookalike keywords, and .cljs files don't count")))

(deftest ^:parallel drift-test
  (let [occurrences [{:file "f.clj", :line 1}
                     {:file "f.clj", :line 2}
                     {:file "new.clj", :line 3}]]
    (is (= {"f.clj"    {:recorded 1, :actual 2, :examples ["f.clj:1" "f.clj:2"]}
            "gone.clj" {:recorded 3, :actual 0}
            "new.clj"  {:recorded 0, :actual 1, :examples ["new.clj:3"]}}
           (dvr/drift {"f.clj" 1, "gone.clj" 3} occurrences))
        "over-budget and new files carry examples; stale budgets don't")
    (is (= {} (dvr/drift {"f.clj" 2, "new.clj" 1} occurrences))
        "matching budgets produce no drift")))

(deftest ^:parallel lowered-budgets-test
  (is (= {"lower.clj" 1, "over.clj" 2}
         (dvr/lowered-budgets {"lower.clj" 3, "over.clj" 2, "gone.clj" 4}
                              {"lower.clj" 1, "over.clj" 5, "new.clj" 7}))
      "budgets only move down: :lower shrinks to actual, :over stays (the test's business),
       :gone is dropped, :new is not added"))

(deftest ^:parallel render-round-trips-test
  (let [budgets (sorted-map "src/a.clj" 2, "src/b.clj" 1)]
    (is (= budgets (read-string (dvr/render budgets))))))
