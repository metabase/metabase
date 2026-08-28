(ns metabase.core.kondo-ratchet-test
  "Ratchet on inline kondo ignore forms: budgets live in `.clj-kondo/ratchets.edn` and only move down.
  The ignore forms in this file are string fixtures — the scanner masks string literals, so they don't
  count as suppressions."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]
   [metabase.config.core :as config]))

(set! *warn-on-reflection* true)

;; Scanning walks the whole tree, so the ratchet tests share one pass per run. The cache only exists
;; while the :once fixture is live; a directly-run test var (no fixture) always scans fresh, so a
;; long-lived REPL never compares fresh ratchet-file contents with stale counts.
(def ^:private tree-scan-cache
  (atom nil))

(defn- tree-scan []
  (if-let [scan @tree-scan-cache]
    @scan
    (kondo-ratchet/scan)))

(defn- ratchets-enabled? []
  (not (kondo-ratchet/disabled?)))

;; Outside CI, tighten the ratchets before asserting — the fix rides along in your next commit.
;; The master shrinker performs this bookkeeping asynchronously after merge.
(use-fixtures :once (fn [thunk]
                      (when-not (System/getenv "CI")
                        (kondo-ratchet/fix!))
                      (reset! tree-scan-cache (delay (kondo-ratchet/scan)))
                      (try
                        (thunk)
                        (finally
                          (reset! tree-scan-cache nil)))))

;;;; ---------------------------------------------------------------------------
;;;; The ratchets themselves
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel budgets-match-actual-counts-test
  (when (ratchets-enabled?)
    (testing (str "\nBudgets in " kondo-ratchet/*ratchets-file* " must match the actual inline ignore counts in development.\n"
                  "Budget too low: remove an ignore, or seed the budget with\n"
                  "`./bin/mage fix-kondo-ratchets --seed <linter>` and defend it in the PR.\n"
                  "Budget too high: run `./bin/mage fix-kondo-ratchets`; the master shrinker\n"
                  "records improvements asynchronously after merge. Too high in a local run means\n"
                  "`fix!` itself is broken, since the test fixture just ran it.")
      (let [{:keys [limits unlimited]} (kondo-ratchet/read-ratchets)]
        (is (= {}
               ((if config/is-test?
                  #(kondo-ratchet/over-budget limits unlimited %)
                  #(kondo-ratchet/drift limits %))
                (tree-scan))))))))

(deftest ^:parallel ignores-are-justified-test
  (when (ratchets-enabled?)
    (testing (str "\nInline ignores of these linters need an explanatory `;;` comment on the line above\n"
                  "(or trailing on the same line) saying why the suppression is warranted.\n"
                  "Linters in :comment-exempt in " kondo-ratchet/*ratchets-file* " are grandfathered;\n"
                  "widening that set is a hand edit to defend in the PR.")
      (let [exempt (:comment-exempt (kondo-ratchet/read-ratchets))]
        (is (= []
               (map #(dissoc % :justified?)
                    (kondo-ratchet/unjustified exempt (tree-scan)))))))))

(deftest ^:parallel no-stale-exemptions-test
  (when (ratchets-enabled?)
    (testing (str "\nEvery linter in :comment-exempt still has at least one unjustified ignore; once the last\n"
                  "one gains a comment, the exemption goes. Run `./bin/mage fix-kondo-ratchets`.")
      (let [{:keys [comment-exempt]} (kondo-ratchet/read-ratchets)]
        (is (= #{}
               (kondo-ratchet/stale-exemptions comment-exempt (tree-scan))))))))

(deftest ^:parallel config-budgets-match-actual-test
  (when (ratchets-enabled?)
    (testing (str "\nConfig-level suppression budgets in " kondo-ratchet/*ratchets-file* " must match\n"
                  ".clj-kondo/config.edn (:off switches and :exclude entries, per linter).\n"
                  "Budget too low: remove the new config suppression, or raise the budget by hand and\n"
                  "defend it in the PR. Budget too high: run `./bin/mage fix-kondo-ratchets`.")
      (is (= {}
             (kondo-ratchet/config-drift (:config-counts (kondo-ratchet/read-ratchets))
                                         (kondo-ratchet/config-suppressions)))))))

(deftest ^:parallel ratchets-file-normalized-test
  (when (ratchets-enabled?)
    (testing (str "\n" kondo-ratchet/*ratchets-file* " should be sorted and aligned exactly as the generator"
                  " writes it.\nAfter a hand edit, run `./bin/mage fix-kondo-ratchets` to normalize the"
                  " formatting.")
      (is (= (kondo-ratchet/render (kondo-ratchet/read-ratchets))
             (slurp kondo-ratchet/*ratchets-file*))))))

;;;; ---------------------------------------------------------------------------
;;;; Scanner unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel mask-strings-and-comments-test
  (are [expected content] (= expected (kondo-ratchet/mask-strings-and-comments content))
    "(f \"     \" x)"        "(f \"a ; b\" x)"
    ;; the comment-start `;` survives; the interior does not
    "(f) ;    \n(g)"         "(f) ; hey\n(g)"
    "(f \"   \n  \")"        "(f \"a b\nc \")"
    ;; escaped quote stays inside the string; char literals are masked so they can't open a string or
    ;; start a comment
    "(f \"      \")"         "(f \"a\\\"b c\")"
    "[\\  \"   \"]"          "[\\\" \"abc\"]"
    "(f \\  \"   \")"        "(f \\; \"a;b\")")
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
    [:all]              "  #_:clj-kondo/ignore\u2003(foo)"
    [:all]              "  ^:clj-kondo/ignore (foo)"
    ;; lookalikes that must NOT count
    []                  "#_:clj-kondo/ignore-my-advice"
    []                  "#_:clj-kondo/ignore?"
    []                  "#_:clj-kondo/ignore!"
    []                  "#_:clj-kondo/ignore+"
    []                  "#_:clj-kondo/ignore*"
    []                  "#_:clj-kondo/ignore'"
    []                  "#_:clj-kondo/ignore$"
    []                  "#_:clj-kondo/ignoreλ"
    []                  "(def foo#:clj-kondo 1)"
    []                  "(def foo#_#:clj-kondo 1)"
    []                  "(defn foo [x] (inc x))"
    ;; ignore forms inside strings and comments don't count either
    []                  "(def s \"#_{:clj-kondo/ignore [:in-a-string]}\")"
    []                  ";; #_{:clj-kondo/ignore [:commented-out]}"))

(deftest ^:parallel noncanonical-ignore-test
  (testing "alternate ignore spellings fail closed instead of asking a partial reader to classify them"
    (are [line] (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"literal ignore key first"
                                  (kondo-ratchet/line-linters line))
      "(def ^{:added \"0.1\" :clj-kondo/ignore [:buried]} x 1)"
      "(ns b {:doc \"d\" :clj-kondo/ignore [:buried]})"
      "{:label :clj-kondo/ignore [:data]}"
      "(def ^#:clj-kondo{:ignore [:namespaced-map]} x 1)"
      "(def ^#:clj-kondo{:doc \"x\", :ignore [:namespaced-map]} x 1)"
      "(def ^#:clj-kondo,{:ignore [:namespaced-map]} x 1)"
      "(def ^#:clj-kondo ;; why\n {:ignore [:namespaced-map]} x 1)"
      "(def ^#:clj-kondo{;; why\n :ignore [:namespaced-map]} x 1)"
      "#_#:clj-kondo{:ignore [:namespaced-map]} (foo)"
      "#_#_#:clj-kondo{:ignore [:namespaced-map]} (foo)")))

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
               "(f) ;; this describes f, not the ignore below\n"
               "#_{:clj-kondo/ignore [:after-code-comment]}\n"
               "(defn after-code-comment [] 5)\n"
               ";; a real comment, but separated from the ignore\n"
               "\n"
               "#_{:clj-kondo/ignore [:after-blank]}\n"
               "(defn after-blank [] 5)\n"
               ";; #_{:clj-kondo/ignore [:commented-out]}\n"
               "(defn j [] 6)\n"
               "#_{:clj-kondo/ignore [:sneaky]} (def s \"a ; b\")\n"))
    (spit (io/file dir "b.clj")
          (str "(ns b {:clj-kondo/ignore [:attr-map]})\n"
               "#_{:clj-kondo/ignore [:extra] :reason \"legacy\"}\n"
               "(defn k [] 6)\n"))
    (let [occurrences (sort-by (juxt :file :line) (kondo-ratchet/scan [(.getPath dir)]))]
      (is (= [{:file (.getPath (io/file dir "a.clj")), :line 2,  :linters [:x :y],               :justified? false}
              {:file (.getPath (io/file dir "a.clj")), :line 5,  :linters [:all],                :justified? true}
              {:file (.getPath (io/file dir "a.clj")), :line 8,  :linters [:multi :line],        :justified? false}
              {:file (.getPath (io/file dir "a.clj")), :line 10, :linters [:trailing],           :justified? true}
              {:file (.getPath (io/file dir "a.clj")), :line 12, :linters [:after-code-comment], :justified? false}
              {:file (.getPath (io/file dir "a.clj")), :line 16, :linters [:after-blank],        :justified? false}
              {:file (.getPath (io/file dir "a.clj")), :line 20, :linters [:sneaky],             :justified? false}
              {:file (.getPath (io/file dir "b.clj")), :line 1,  :linters [:attr-map],           :justified? false}
              {:file (.getPath (io/file dir "b.clj")), :line 2,  :linters [:extra],              :justified? false}]
             occurrences)
          "strings and commented-out forms don't count; multi-line vectors, attr-maps, and extra keys do;
           a semicolon inside a trailing string is not a justification")
      (is (= {:x                  1
              :y                  1
              :all                1
              :multi              1
              :line               1
              :trailing           1
              :after-code-comment 1
              :after-blank        1
              :sneaky             1
              :attr-map           1
              :extra              1}
             (kondo-ratchet/actual-counts occurrences))))))

(deftest ^:parallel scan-error-identifies-file-test
  (let [dir  (.toFile (java.nio.file.Files/createTempDirectory
                       "kondo-ratchet-error-test"
                       (make-array java.nio.file.attribute.FileAttribute 0)))
        file (io/file dir "unsupported.clj")]
    (spit file "(def ^{:doc \"x\" :clj-kondo/ignore [:buried]} x 1)")
    (try
      (doall (kondo-ratchet/scan [(.getPath dir)]))
      (is false "unsupported syntax should fail closed")
      (catch clojure.lang.ExceptionInfo e
        (is (= (.getPath file) (:file (ex-data e))))
        (is (str/includes? (.getMessage e) (.getPath file)))))))

;;;; ---------------------------------------------------------------------------
;;;; Budget bookkeeping unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel render-test
  (testing "keys come out sorted, values aligned, and the text round-trips losslessly"
    (let [ratchets {:limits         {:discouraged-var 3, :all 1, :metabase/modules 2}
                    :unlimited      #{:unused-alias}
                    :config-counts  {:unresolved-symbol 18, :inline-def 1}
                    :comment-exempt #{:metabase/modules :discouraged-var}}
          text     (kondo-ratchet/render ratchets)]
      (is (str/ends-with? text (str "{:limits {:all              1\n"
                                    "          :discouraged-var  3\n"
                                    "          :metabase/modules 2}\n"
                                    " :unlimited #{\n"
                                    "            :unused-alias\n"
                                    "           }\n"
                                    " :config-counts  {:inline-def        1\n"
                                    "                  :unresolved-symbol 18}\n"
                                    " :comment-exempt #{:discouraged-var\n"
                                    "                   :metabase/modules}}\n")))
      (is (= ratchets (edn/read-string text)))
      (is (= text (kondo-ratchet/render (edn/read-string text))))))
  (testing "empty ratchets"
    (is (str/ends-with? (kondo-ratchet/render {:limits {}, :unlimited #{}, :config-counts {}, :comment-exempt #{}})
                        "{:limits {}\n :unlimited #{}\n :config-counts  {}\n :comment-exempt #{}\n}\n"))))

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

(deftest ^:parallel fix-when-disabled-test
  (testing "fix! explains that the ratchets are disabled and leaves the file unchanged"
    (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                            "kondo-ratchet-test"
                            (make-array java.nio.file.attribute.FileAttribute 0)))
          budgets (doto (io/file dir "ratchets.edn") (spit "{:disabled true}\n"))]
      (binding [kondo-ratchet/*ratchets-file* (.getPath budgets)]
        (is (kondo-ratchet/disabled?))
        (is (= (str (.getPath budgets) " is disabled -- nothing to do\n")
               (with-out-str (kondo-ratchet/fix! {:seed "whatever"}))))
        (is (= "{:disabled true}\n" (slurp budgets)))))))

(deftest ^:parallel missing-ratchets-file-fails-test
  (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                          "kondo-ratchet-test"
                          (make-array java.nio.file.attribute.FileAttribute 0)))
        missing (.getPath (io/file dir "missing-ratchets.edn"))]
    (binding [kondo-ratchet/*ratchets-file* missing]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"ratchets.edn is missing"
                            (kondo-ratchet/read-ratchets)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"ratchets.edn is missing"
                            (kondo-ratchet/disabled?))))))

;;;; ---------------------------------------------------------------------------
;;;; Justification bookkeeping unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel unjustified-test
  (let [occurrences [{:file "f.clj", :line 1, :linters [:a],    :justified? false}
                     {:file "f.clj", :line 2, :linters [:a :b], :justified? false}
                     {:file "f.clj", :line 3, :linters [:a],    :justified? true}
                     {:file "f.clj", :line 4, :linters [:all],  :justified? false}]]
    (is (= [2 4]
           (map :line (kondo-ratchet/unjustified #{:a} occurrences)))
        "line 1 is fully exempt, line 2 still owes :b a comment, line 3 is justified,
         line 4's :all is not exempt")))

(deftest ^:parallel stale-exemptions-test
  (let [occurrences [{:file "f.clj", :line 1, :linters [:a], :justified? false}
                     {:file "f.clj", :line 2, :linters [:b], :justified? true}]]
    (is (= #{:b}
           (kondo-ratchet/stale-exemptions #{:a :b} occurrences))
        ":a still has an unjustified ignore; :b's are all justified so its exemption is stale")))

(deftest ^:parallel config-suppressions-test
  (is (= {:redundant-ignore        1
          :unresolved-symbol       5
          :discouraged-java-method 1
          :missing-docstring       2
          :discouraged-var         1
          :unused-referred-var     4
          :deprecated-var          1}
         (kondo-ratchet/config-suppressions
          '{:linters           {:redundant-ignore    {:level :off}
                                :unresolved-symbol   {:exclude [a b c]}
                                :unused-referred-var {:exclude {compojure.core [GET DELETE POST PUT]}}
                                :deprecated-var      {:exclude {some.ns/old-var {:namespaces [caller.*]}}}
                                :discouraged-var     {clojure.core/println {:message "no"}}
                                ;; nests two deep: class -> method
                                :discouraged-java-method {java.lang.System {exit {:level :off}
                                                                            gc   {:level :error}}}
                                :equals-true         {:level :warning}}
            :config-in-comment {:linters {:unresolved-symbol {:level :off}}}
            :config-in-ns      {tests {:linters {:missing-docstring {:level :off}
                                                 :discouraged-var   {clojure.core/println {:level :off}}}}
                                lib   {:linters {:missing-docstring {:level :off}}}}
            :config-in-call    {some.ns/with-thing {:linters {:unresolved-symbol {:level :off}}}}}))
      "an :off is 1, :exclude items count each (map values count their elements; a scoping map is one
       var), per-var re-allows count at any nesting depth, discouragements and enablements count
       nothing; groups, :config-in-comment and :config-in-call sum per linter"))

(deftest ^:parallel config-drift-test
  (is (= {:gone {:recorded 2, :actual 0}
          :new  {:recorded 0, :actual 1}
          :up   {:recorded 1, :actual 3}}
         (kondo-ratchet/config-drift {:gone 2, :same 5, :up 1}
                                     {:same 5, :new 1, :up 3}))))

(deftest ^:parallel change-report-test
  (let [occurrences (concat (for [[linter n] {:lower 3, :over 7, :new 9, :same 4}
                                  i          (range n)]
                              {:file "f.clj", :line (inc i), :linters [linter], :justified? false})
                            [{:file "g.clj", :line 1, :linters [:polite], :justified? true}])]
    (is (= ["seeded :new at 9"
            "WARNING: :void has no inline ignores -- nothing to seed"
            "dropped :gone (no ignores left)"
            "lowered :lower 5 -> 3"
            "WARNING: :over is over budget (5 recorded, 7 actual) -- remove ignores, or accept them all with `--seed :over`"
            "dropped config :cfg-gone (no suppressions left)"
            "lowered config :cfg-lower 4 -> 2"
            "WARNING: config suppressions for :cfg-over are over budget (1 recorded, 3 actual) -- remove one from .clj-kondo/config.edn or raise the budget by hand"
            "unexempted :polite (all its ignores are justified now)"]
           (kondo-ratchet/change-report {:limits         {:lower 5, :over 5, :gone 5, :same 4, :polite 1}
                                         :unlimited      #{}
                                         :config-counts  {:cfg-lower 4, :cfg-over 1, :cfg-gone 2, :cfg-same 6}
                                         :comment-exempt #{:lower :polite}}
                                        occurrences
                                        {:cfg-lower 2, :cfg-over 3, :cfg-same 6}
                                        [:new :void]))
        "untouched budgets (:same, :cfg-same) and a still-needed exemption (:lower) earn no line")))
