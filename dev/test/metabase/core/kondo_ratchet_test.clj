(ns metabase.core.kondo-ratchet-test
  "Unit tests for [[dev.kondo-ratchet]]: scanning, policy reading, rendering, merging, and shrinking.
  [[metabase.core.kondo-ratchet-check-test]] tests the command that checks the source tree.
  The ignore forms in this file are string fixtures — the scanner masks string literals, so they don't
  count as suppressions."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.kondo-ratchet :as kondo-ratchet]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;;; ---------------------------------------------------------------------------
;;;; Budget semantics
;;;; ---------------------------------------------------------------------------

;; Feature branches may leave budgets above current counts and comment exemptions that are no longer
;; needed. The shrink workflow lowers budgets after merge; stale exemptions must be removed by hand.
(deftest ^:parallel reductions-are-tolerated-test
  (let [occurrences [{:file "f.clj", :line 1, :linters [:a], :justified? false}
                     {:file "g.clj", :line 1, :linters [:b], :justified? true}]]
    (testing "inline budgets"
      (is (= {} (kondo-ratchet/over-budget {:a 3, :b 1} occurrences)))
      (is (= {:a {:recorded 0, :actual 1, :examples ["f.clj:1"]}}
             (kondo-ratchet/over-budget {:b 1} occurrences))))
    (testing "config budgets"
      (is (= {} (kondo-ratchet/counts-over-budget {:cfg 3} {:cfg 1})))
      (is (= {:cfg {:recorded 1, :actual 2}} (kondo-ratchet/counts-over-budget {:cfg 1} {:cfg 2}))))))

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

(defn- reference-mask
  "What [[kondo-ratchet/mask-strings-and-comments]] must return for `content`, found one character at a time.
  Slow, and easy to check against the three states it names."
  [^String content]
  (let [sb (StringBuilder. content)
        n  (count content)
        blank-at! (fn [i]
                    (when (and (< i n) (not= \newline (.charAt sb (int i))))
                      (.setCharAt sb (int i) \space)))]
    (loop [i 0, state :code]
      (if (>= i n)
        (str sb)
        (let [c (.charAt sb (int i))]
          (case state
            :code    (case c
                       \" (recur (inc i) :string)
                       \; (recur (inc i) :comment)
                       \\ (do (blank-at! (inc i)) (recur (+ i 2) :code))
                       (recur (inc i) :code))
            :string  (case c
                       \" (recur (inc i) :code)
                       \\ (do (blank-at! i) (blank-at! (inc i)) (recur (+ i 2) :string))
                       (do (blank-at! i) (recur (inc i) :string)))
            :comment (if (= c \newline)
                       (recur (inc i) :code)
                       (do (blank-at! i) (recur (inc i) :comment)))))))))

(deftest ^:parallel mask-matches-reference-test
  (testing "inputs that end mid-token"
    (are [content] (= (reference-mask content) (kondo-ratchet/mask-strings-and-comments content))
      ""
      "\""
      "(f \"never closed"
      "(f \"ends on an escape\\"
      "(f) \\"
      "(f) ; no newline"
      "\"a\\\nb\" \\\n ; c"))
  (testing "characters outside the basic plane keep their two-char length"
    (let [content "(f \"\uD83D\uDE00 caf\u00e9\") ; \uD83D\uDE00\n(g \\\uD83D\uDE00)"]
      (is (= (reference-mask content) (kondo-ratchet/mask-strings-and-comments content)))))
  (testing "a string with more escapes than a recursive regex could match"
    (let [content (str "(def x \"" (str/join (repeat 20000 "\\\"a")) "\")")]
      (is (= (reference-mask content) (kondo-ratchet/mask-strings-and-comments content)))))
  (testing "random text over the characters that change the masker's state"
    (let [alphabet [\" \" \\ \\ \; \newline \a \space \# \{ (char 0xD83D) (char 0xDE00)]
          rnd      (java.util.Random. 42)
          pick     (fn [] (nth alphabet (.nextInt rnd (count alphabet))))
          texts    (repeatedly 20000 #(str/join (repeatedly (.nextInt rnd 16) pick)))]
      (is (= []
             (remove #(= (reference-mask %) (kondo-ratchet/mask-strings-and-comments %)) texts)))))
  (testing "this repository's own backend source"
    (is (= []
           (for [root  ["src" "test" "enterprise/backend" "dev" "mage"]
                 ^java.io.File file (file-seq (io/file root))
                 :when (and (.isFile file) (re-find #"\.clj[cs]?$" (.getName file)))
                 :let  [content (slurp file)]
                 :when (not= (reference-mask content) (kondo-ratchet/mask-strings-and-comments content))]
             (.getPath file))))))

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

(deftest ^:parallel module-escape-hatches-test
  (is (= {:api-any              1
          :friend-edges         3
          :model-imports-bypass 1
          :ns-prefixes          1
          :uses-any             1}
         (kondo-ratchet/module-escape-hatches
          {'a {:api :any, :friends #{'b 'c}, :uses #{'b}, :model-imports :bypass}
           'b {:api           #{'b.api}
               :friends       #{'a}
               :uses          :any
               :model-imports #{:model/A}
               :ns-prefix     "metabase.legacy-b"}}))))

(deftest ^:parallel render-test
  (testing "renders stable text with sorted entries, one field per line, each own field aligned under its
            own opening bracket regardless of another field's name length"
    (let [ratchets {:ignore-counts  {:all              1
                                     :metabase/modules 2
                                     :unused-alias     :unlimited}
                    :discouraged-var-counts
                    {:entity-retrieval.core/search-unfiltered    2
                     :ee.entity-retrieval.core/search-unfiltered 6}
                    :discouraged-namespace-counts {:clojure.tools.logging 8}
                    :config-counts  {:inline-def        1
                                     :unresolved-symbol 18}
                    :comment-exempt #{:metabase/modules :discouraged-var}}
          text     (kondo-ratchet/render ratchets)]
      (is (str/ends-with? text
                          (str "{:ignore-counts                {:all              1\n"
                               "                                :metabase/modules 2\n"
                               "                                :unused-alias     :unlimited}\n"
                               " :discouraged-namespace-counts {:clojure.tools.logging 8}\n"
                               " :discouraged-var-counts       {:ee.entity-retrieval.core/search-unfiltered 6\n"
                               "                                :entity-retrieval.core/search-unfiltered    2}\n"
                               " :config-counts                {:inline-def        1\n"
                               "                                :unresolved-symbol 18}\n"
                               " :comment-exempt               #{:discouraged-var\n"
                               "                                 :metabase/modules}}\n")))
      (is (= ratchets (edn/read-string text)))
      (is (= text (kondo-ratchet/render (edn/read-string text))))))
  (testing "empty ratchets"
    (is (str/ends-with? (kondo-ratchet/render {:ignore-counts {}, :discouraged-var-counts {}
                                               :discouraged-namespace-counts {}, :config-counts {}
                                               :comment-exempt #{}})
                        (str "{:ignore-counts                {}\n"
                             " :discouraged-namespace-counts {}\n"
                             " :discouraged-var-counts       {}\n"
                             " :config-counts                {}\n"
                             " :comment-exempt               #{}}\n")))))

(deftest ^:parallel render-test-test
  (let [ratchets {:ignore-counts                {:unused-binding 3}
                  :discouraged-namespace-counts {}
                  :discouraged-var-counts       {:clojure.core/println 2}
                  :comment-exempt               #{:discouraged-var}}
        text     (kondo-ratchet/render-test (assoc ratchets :config-counts {}))]
    (is (str/starts-with? text ";; Budgets for kondo suppressions in test code"))
    (is (str/ends-with? text (str "{:ignore-counts                {:unused-binding 3}\n"
                                  " :discouraged-namespace-counts {}\n"
                                  " :discouraged-var-counts       {:clojure.core/println 2}\n"
                                  " :comment-exempt               #{:discouraged-var}}\n"))
        "no :config-counts -- only the prod file tracks them")
    (is (= ratchets (edn/read-string text)))
    (is (= text (kondo-ratchet/render-test (edn/read-string text)))))
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must not set :config-counts"
                        (kondo-ratchet/render-test {:ignore-counts {}, :config-counts {:a 1}, :comment-exempt #{}}))
      "a nonempty :config-counts is an error, not silently dropped"))

(deftest ^:parallel render-module-ratchets-test
  (let [ratchets {:uses-any 4, :api-any 1}
        text     (kondo-ratchet/render-module-ratchets ratchets)]
    (is (str/ends-with? text "{:api-any  1\n :uses-any 4}\n"))
    (is (= ratchets (edn/read-string text)))
    (is (= text (kondo-ratchet/render-module-ratchets (edn/read-string text))))))

(deftest read-ratchets-policy-values-test
  (let [file (doto (java.io.File/createTempFile "kondo-ratchets" ".edn")
               (spit (pr-str {:ignore-counts {:bounded 4, :free :unlimited}})))]
    (binding [kondo-ratchet/*ratchets-file* (.getPath file)]
      (is (= {:ignore-counts                {:bounded 4, :free :unlimited}
              :discouraged-var-counts       {}
              :discouraged-namespace-counts {}
              :config-counts                {}
              :comment-exempt               #{}}
             (kondo-ratchet/read-ratchets))))))

(deftest read-ratchets-validates-policies-test
  (doseq [[value message] [[-1 #"non-negative integer or :unlimited"]
                           [:other #"non-negative integer or :unlimited"]
                           ["1" #"non-negative integer or :unlimited"]]]
    (let [file (doto (java.io.File/createTempFile "kondo-ratchets" ".edn")
                 (spit (pr-str {:ignore-counts {:a value}})))]
      (binding [kondo-ratchet/*ratchets-file* (.getPath file)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                              (kondo-ratchet/read-ratchets)))))))

(deftest read-ratchets-validates-config-counts-test
  (doseq [value [-1 :unlimited "1"]]
    (let [file (doto (java.io.File/createTempFile "kondo-ratchets" ".edn")
                 (spit (pr-str {:config-counts {:a value}})))]
      (binding [kondo-ratchet/*ratchets-file* (.getPath file)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"expected a non-negative integer"
                              (kondo-ratchet/read-ratchets))
            (str "config budgets are always plain counts, so " (pr-str value) " is rejected"))))))

(deftest read-module-ratchets-test
  (doseq [[content message] [["{:api-any 1}" nil]
                             ["{:api-any :unlimited}" #"expected a non-negative integer"]
                             ["{\"api-any\" 1}" #"is not a module metric"]]]
    (let [file (doto (java.io.File/createTempFile "module-ratchets" ".edn") (spit content))]
      (binding [kondo-ratchet/*module-ratchets-file* (.getPath file)]
        (if message
          (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                                (kondo-ratchet/read-module-ratchets)))
          (is (= {:api-any 1} (kondo-ratchet/read-module-ratchets))))))))

(deftest read-ratchets-validates-field-shapes-test
  (doseq [[field message] [[:ignore-counts  #":ignore-counts must be a map"]
                           [:config-counts  #":config-counts must be a map"]
                           [:comment-exempt #":comment-exempt must be a set"]]]
    (let [file (doto (java.io.File/createTempFile "kondo-ratchets" ".edn")
                 (spit (pr-str {field []})))]
      (binding [kondo-ratchet/*ratchets-file* (.getPath file)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                              (kondo-ratchet/read-ratchets))
            (str "an empty vector under " field " is not an empty policy map"))))))

(deftest ^:parallel lowered-counts-test
  (is (= {:empty-unbounded :unlimited
          :lower           3
          :over-budget     5
          :unbounded       :unlimited}
         (kondo-ratchet/lowered-counts {:empty-unbounded :unlimited
                                        :gone            5
                                        :lower           5
                                        :over-budget     5
                                        :unbounded       :unlimited}
                                       {:lower       3
                                        :new-linter  9
                                        :over-budget 7
                                        :unbounded   4}
                                       []))
      "budgets only ever move down: :lower shrinks to actual, :over-budget stays (the test's business),
       :gone is dropped at zero but an unlimited policy is kept, :new-linter is not added")
  (testing "seeding is the escape hatch: sets the budget to actual, adding or raising"
    (is (= {:new-linter 9, :raised 7}
           (kondo-ratchet/lowered-counts {:raised 5}
                                         {:new-linter 9, :raised 7}
                                         [:new-linter :raised])))
    (is (= {}
           (kondo-ratchet/lowered-counts {} {} [:nothing-to-seed]))
        "seeding a linter with no ignores adds nothing")
    (is (= {}
           (kondo-ratchet/lowered-counts {:empty :unlimited} {} [:empty]))
        "seeding an unlimited linter with no ignores converts it to a count, which is zero, so it goes")))

(deftest ^:parallel unexercised-unlimited-test
  (let [ignore-counts {:z-empty :unlimited, :a-empty :unlimited, :used :unlimited, :bounded-empty 3}]
    (is (= #{:a-empty :z-empty}
           (kondo-ratchet/unexercised-unlimited ignore-counts {:used 2}))
        "only unlimited policies at zero, in name order; a bounded zero is the fixer's business")
    (is (= "WARNING: :unlimited policies with no ignores left: :a-empty, :z-empty -- delete an entry by hand once its linter no longer needs one"
           (kondo-ratchet/unexercised-unlimited-warning ignore-counts {:used 2})))
    (is (nil? (kondo-ratchet/unexercised-unlimited-warning ignore-counts {:used 2, :a-empty 1, :z-empty 1}))
        "no line when every unlimited policy is in use")))

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
  (testing "unlimited policies never drift, including when their actual count reaches zero"
    (is (= {}
           (kondo-ratchet/drift {:free :unlimited, :empty :unlimited}
                                [{:file "f.clj", :line 1, :linters [:free]}]))))
  (testing "examples are capped at 5"
    (let [occurrences (for [line (range 1 10)]
                        {:file "f.clj", :line line, :linters [:a]})]
      (is (= 5 (count (:examples (:a (kondo-ratchet/drift {} occurrences)))))))))

(deftest ^:parallel over-budget-unlimited-test
  (let [policies    {:bounded 2, :free :unlimited, :empty :unlimited}
        occurrences [{:file "f.clj", :line 1, :linters [:bounded :free]}]]
    (is (= {}
           (kondo-ratchet/over-budget policies occurrences))
        "unused numeric budgets and unlimited policies do not fail the check")))

(deftest ^:synchronized fix-when-disabled-test
  (testing "fix! explains that the ratchets are disabled, counts nothing, and leaves the file unchanged"
    (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                            "kondo-ratchet-test"
                            (make-array java.nio.file.attribute.FileAttribute 0)))
          budgets (doto (io/file dir "ratchets.edn") (spit "{:disabled true}\n"))]
      (binding [kondo-ratchet/*ratchets-file* (.getPath budgets)]
        (is (kondo-ratchet/disabled?))
        (mt/with-dynamic-fn-redefs
          [kondo-ratchet/known-linters         #(throw (AssertionError. "read the known linters"))
           kondo-ratchet/scan                  #(throw (AssertionError. "scanned the source tree"))
           kondo-ratchet/config-suppressions   #(throw (AssertionError. "counted config suppressions"))
           kondo-ratchet/module-escape-hatches #(throw (AssertionError. "counted module escape hatches"))]
          (is (= (str (.getPath budgets) " is disabled -- nothing to do\n")
                 (with-out-str (kondo-ratchet/fix! {:seed "whatever"})))))
        (is (= "{:disabled true}\n" (slurp budgets)))))))

(defn- empty-test-ratchets-file!
  "A temp `.clj-kondo/ratchets-test.edn` stand-in, already clean (no budgets) -- so a [[kondo-ratchet/fix!]]
  run with no test-path occurrences writes nothing and reports nothing for it."
  ^java.io.File [dir]
  (doto (io/file dir "ratchets-test.edn")
    (spit (kondo-ratchet/render-test {:ignore-counts {}, :comment-exempt #{}}))))

(deftest ^:synchronized seed-unlimited-linter-test
  (let [dir        (.toFile (java.nio.file.Files/createTempDirectory
                             "kondo-ratchet-test"
                             (make-array java.nio.file.attribute.FileAttribute 0)))
        ratchets   {:ignore-counts {:free :unlimited}, :config-counts {}, :comment-exempt #{}}
        budgets    (doto (io/file dir "ratchets.edn") (spit (kondo-ratchet/render ratchets)))
        modules    (doto (io/file dir "module-ratchets.edn")
                     (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (empty-test-ratchets-file! dir)
        occurrences [{:file "f.clj", :line 1, :linters [:free]}
                     {:file "f.clj", :line 2, :linters [:free]}]]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{:free})
                                  kondo-ratchet/scan                  (constantly occurrences)
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})]
        (is (= ["seeded :free at 2"
                "WARNING: :free has no inline ignores -- nothing to seed"
                (str "wrote " (.getPath budgets))]
               (str/split-lines (with-out-str (kondo-ratchet/fix! {:seed "free"}))))
            "the prod occurrences seed the prod budget; the seeded linter has none under `test/`, so the
             test report says so and the test file is left untouched"))
      (is (= {:ignore-counts                {:free 2}
              :discouraged-var-counts       {}
              :discouraged-namespace-counts {}
              :config-counts                {}
              :comment-exempt               #{}}
             (kondo-ratchet/read-ratchets))))))

(deftest ^:synchronized seed-unknown-linter-test
  (let [dir     (.toFile (java.nio.file.Files/createTempDirectory
                          "kondo-ratchet-test"
                          (make-array java.nio.file.attribute.FileAttribute 0)))
        text    (kondo-ratchet/render {:ignore-counts {:free :unlimited}, :config-counts {}, :comment-exempt #{}})
        budgets (doto (io/file dir "ratchets.edn") (spit text))
        modules (doto (io/file dir "module-ratchets.edn")
                  (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (empty-test-ratchets-file! dir)]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters (constantly #{:free})
                                  kondo-ratchet/scan          (fn [] (throw (AssertionError. "scanned before validating the seed")))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"^cannot seed :bogus: not a known linter -- policies must name"
                              (kondo-ratchet/fix! {:seed ":bogus"})))
        (is (= text (slurp budgets))
            "nothing is written")))))

(deftest ^:synchronized fix-keeps-decision-policies-test
  (let [dir         (.toFile (java.nio.file.Files/createTempDirectory
                              "kondo-ratchet-test"
                              (make-array java.nio.file.attribute.FileAttribute 0)))
        ratchets    {:ignore-counts  {:free :unlimited, :empty :unlimited, :gone 2, :zero 0}
                     :config-counts  {}
                     :comment-exempt #{:empty}}
        budgets     (doto (io/file dir "ratchets.edn") (spit (kondo-ratchet/render ratchets)))
        modules     (doto (io/file dir "module-ratchets.edn")
                      (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (empty-test-ratchets-file! dir)
        occurrences [{:file "f.clj", :line 1, :linters [:free]}]
        run!        #(str/split-lines (with-out-str (kondo-ratchet/fix!)))]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{:free :empty :gone :zero})
                                  kondo-ratchet/scan                  (constantly occurrences)
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})]
        (is (= ["dropped :gone (no ignores left)"
                "dropped :zero (no ignores left)"
                "WARNING: :unlimited policies with no ignores left: :empty -- delete an entry by hand once its linter no longer needs one"
                "WARNING: :comment-exempt is no longer needed for these linters: :empty -- delete the stale entries by hand"
                (str "wrote " (.getPath budgets))]
               (run!))
            "bounded zeros go; decision policies stay and are reported when no longer needed")
        (is (= {:ignore-counts                {:free :unlimited, :empty :unlimited}
                :discouraged-var-counts       {}
                :discouraged-namespace-counts {}
                :config-counts                {}
                :comment-exempt               #{:empty}}
               (kondo-ratchet/read-ratchets)))
        (is (= ["WARNING: :unlimited policies with no ignores left: :empty -- delete an entry by hand once its linter no longer needs one"
                "WARNING: :comment-exempt is no longer needed for these linters: :empty -- delete the stale entries by hand"
                "unchanged"]
               (run!))
            "a second run changes nothing and still reports")))))

(def ^:private no-findings
  {:actual {}, :unattributed [], :unresolved []})

(deftest ^:synchronized fix-refuses-without-attribution-test
  (let [dir         (.toFile (java.nio.file.Files/createTempDirectory
                              "kondo-ratchet-test"
                              (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets     (doto (io/file dir "ratchets.edn")
                      (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {}, :comment-exempt #{}})))
        modules     (doto (io/file dir "module-ratchets.edn")
                      (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (empty-test-ratchets-file! dir)
        occurrences [{:file "f.clj", :line 1, :linters [:discouraged-var]}]
        before      (slurp budgets)]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{:discouraged-var})
                                  kondo-ratchet/scan                  (constantly occurrences)
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})]
        (testing "a discouraged-var ignore with no :attribute throws rather than reading as zero"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"needs a kondo run"
                                (kondo-ratchet/fix!))))
        (testing "an unresolved finding throws before writing"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"f.clj:1: :discouraged-var finding not resolved"
                                (kondo-ratchet/fix! {:attribute (constantly
                                                                 [(assoc no-findings :unresolved occurrences)
                                                                  no-findings])}))))
        (is (= before (slurp budgets)))))))

(deftest ^:synchronized fix-splits-discouraged-counts-by-file-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {}, :comment-exempt #{}})))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (empty-test-ratchets-file! dir)
        occurrences  [{:file "src/f.clj", :line 1, :linters [:discouraged-var]}
                      {:file "test/g.clj", :line 1, :linters [:discouraged-var]}]
        ;; stands in for kondo: one finding per prod occurrence, two per test occurrence
        attribute    (fn [groups]
                       (mapv (fn [occs]
                               (assoc no-findings :actual {:discouraged-var {:a/x (reduce + (for [{:keys [file]} occs]
                                                                                              (if (str/starts-with? file "test/")
                                                                                                2
                                                                                                1)))}}))
                             groups))]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters          (constantly #{:discouraged-var})
                                  kondo-ratchet/discouraged-count-keys (constantly #{:a/x})
                                  kondo-ratchet/scan                   (constantly occurrences)
                                  kondo-ratchet/config-suppressions    (constantly {})
                                  kondo-ratchet/module-escape-hatches  (constantly {})]
        (is (= ["seeded :a/x at 1"
                "seeded :a/x at 2"
                (str "wrote " (.getPath budgets))
                (str "wrote " (.getPath test-budgets))]
               (str/split-lines (with-out-str (kondo-ratchet/fix! {:seed      ":discouraged-var/a/x"
                                                                   :attribute attribute}))))
            "each file's symbol budget comes from attributing that file's own occurrences")
        (is (=? {:discouraged-var-counts {:a/x 1}} (kondo-ratchet/read-ratchets)))
        (is (=? {:discouraged-var-counts {:a/x 2}}
                (binding [kondo-ratchet/*ratchets-file* (.getPath test-budgets)]
                  (kondo-ratchet/read-ratchets))))))))

(deftest ^:synchronized fix-drops-unconfigured-and-bulk-seeds-quietly-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render {:ignore-counts          {}
                                                    :discouraged-var-counts {:a/gone 2, :a/y 1}
                                                    :config-counts          {}
                                                    :comment-exempt         #{}})))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (empty-test-ratchets-file! dir)
        occurrences  [{:file "src/f.clj", :line 1, :linters [:discouraged-var]}]
        attribute    (constantly [(assoc no-findings :actual {:discouraged-var {:a/x 1}}) no-findings])]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters          (constantly #{:discouraged-var})
                                  kondo-ratchet/discouraged-count-keys (constantly #{:a/x :a/y :a/z})
                                  kondo-ratchet/scan                   (constantly occurrences)
                                  kondo-ratchet/config-suppressions    (constantly {})
                                  kondo-ratchet/module-escape-hatches  (constantly {})]
        (is (= ["seeded :a/x at 1"
                "WARNING: :a/y has no inline ignores -- dropping its policy"
                "dropped :a/gone (no ignores left)"
                (str "wrote " (.getPath budgets))]
               (str/split-lines (with-out-str (kondo-ratchet/fix! {:seed      ":discouraged-var"
                                                                   :attribute attribute}))))
            "a budget for a symbol no longer configured is dropped rather than refused, and a bulk seed
             reports only the symbols it changes: unused :a/z gets no line, here or for the test file")
        (is (=? {:discouraged-var-counts {:a/x 1}} (kondo-ratchet/read-ratchets)))))))

(deftest ^:synchronized fix-refuses-colliding-symbols-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {}, :comment-exempt #{}})))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (empty-test-ratchets-file! dir)
        before       (slurp budgets)]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{})
                                  kondo-ratchet/kondo-config          (constantly '{:linters {:discouraged-var {a/x          {}
                                                                                                                metabase.a/x {}}}})
                                  kondo-ratchet/scan                  (constantly [])
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"share the ratchet key :a/x"
                              (kondo-ratchet/fix! {:attribute (constantly [no-findings no-findings])}))
            "an unseeded shrink refuses two symbols on one key rather than merging their budgets")
        (is (= before (slurp budgets)))))))

(deftest ^:synchronized fix-drops-stale-flat-discouraged-entry-test
  (let [dir         (.toFile (java.nio.file.Files/createTempDirectory
                              "kondo-ratchet-test"
                              (make-array java.nio.file.attribute.FileAttribute 0)))
        ratchets    {:ignore-counts          {:discouraged-var 3, :a 1}
                     :discouraged-var-counts {}
                     :config-counts          {}
                     :comment-exempt         #{}}
        budgets     (doto (io/file dir "ratchets.edn") (spit (kondo-ratchet/render ratchets)))
        test-budgets (empty-test-ratchets-file! dir)
        modules     (doto (io/file dir "module-ratchets.edn")
                      (spit (kondo-ratchet/render-module-ratchets {})))
        occurrences [{:file "f.clj", :line 1, :linters [:discouraged-var]}
                     {:file "f.clj", :line 2, :linters [:discouraged-var]}
                     {:file "f.clj", :line 3, :linters [:discouraged-var]}
                     {:file "f.clj", :line 4, :linters [:a]}]]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{:discouraged-var :a})
                                  kondo-ratchet/scan                  (constantly occurrences)
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})]
        (is (= [(str "dropped stale :ignore-counts entry for :discouraged-var in " (.getPath budgets)
                     " (tracked per-symbol in :discouraged-var-counts now)")
                (str "wrote " (.getPath budgets))]
               (str/split-lines (with-out-str (kondo-ratchet/fix! {:attribute (constantly [no-findings no-findings])}))))
            "the stale flat entry is dropped without needing --seed")
        (is (= {:ignore-counts                {:a 1}
                :discouraged-var-counts       {}
                :discouraged-namespace-counts {}
                :config-counts                {}
                :comment-exempt               #{}}
               (kondo-ratchet/read-ratchets)))))))

(deftest ^:synchronized fix-lowers-module-counts-test
  (let [dir      (.toFile (java.nio.file.Files/createTempDirectory
                           "kondo-ratchet-test"
                           (make-array java.nio.file.attribute.FileAttribute 0)))
        ratchets {:ignore-counts {}, :config-counts {}, :comment-exempt #{}}
        budgets  (doto (io/file dir "ratchets.edn") (spit (kondo-ratchet/render ratchets)))
        modules  (doto (io/file dir "module-ratchets.edn")
                   (spit (kondo-ratchet/render-module-ratchets
                          {:api-any 2, :friend-edges 5, :uses-any 1})))
        test-budgets (empty-test-ratchets-file! dir)]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{})
                                  kondo-ratchet/scan                  (constantly [])
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {:api-any 1, :friend-edges 4, :uses-any 0})]
        (is (= ["lowered module :api-any 2 -> 1"
                "lowered module :friend-edges 5 -> 4"
                "dropped module :uses-any (no escape hatches left)"
                (str "wrote " (.getPath modules))]
               (str/split-lines (with-out-str (kondo-ratchet/fix!)))))
        (is (= {:api-any 1, :friend-edges 4}
               (kondo-ratchet/read-module-ratchets)))))))

(deftest ^:synchronized fix-splits-prod-and-test-budgets-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        ratchets     {:ignore-counts {:a 5}, :config-counts {}, :comment-exempt #{}}
        budgets      (doto (io/file dir "ratchets.edn") (spit (kondo-ratchet/render ratchets)))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (doto (io/file dir "ratchets-test.edn")
                       (spit (kondo-ratchet/render-test (dissoc ratchets :config-counts))))
        occurrences  [{:file "src/f.clj",  :line 1, :linters [:a]}
                      {:file "src/f.clj",  :line 2, :linters [:a]}
                      {:file "test/g.clj", :line 1, :linters [:a]}]]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters         (constantly #{:a})
                                  kondo-ratchet/scan                  (constantly occurrences)
                                  kondo-ratchet/config-suppressions   (constantly {})
                                  kondo-ratchet/module-escape-hatches (constantly {})]
        (is (= ["lowered :a 5 -> 2"
                "lowered :a 5 -> 1"
                (str "wrote " (.getPath budgets))
                (str "wrote " (.getPath test-budgets))]
               (str/split-lines (with-out-str (kondo-ratchet/fix!))))
            "the two src occurrences lower the prod budget to 2; the one test occurrence lowers the test
             budget to 1, independently -- neither count masks the other"))
      (is (=? {:ignore-counts {:a 2}, :config-counts {}, :comment-exempt #{}}
              (kondo-ratchet/read-ratchets)))
      (is (=? {:ignore-counts {:a 1}, :config-counts {}, :comment-exempt #{}}
              (binding [kondo-ratchet/*ratchets-file* (.getPath test-budgets)]
                (kondo-ratchet/read-ratchets)))))))

(deftest ^:synchronized fix-validates-test-ratchets-against-the-right-file-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {}, :comment-exempt #{}})))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (doto (io/file dir "ratchets-test.edn")
                       (spit (kondo-ratchet/render-test {:ignore-counts {:bogus 1}, :comment-exempt #{}})))]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters (constantly #{})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              (re-pattern (str "^" (java.util.regex.Pattern/quote (.getPath test-budgets))
                                               " names 1 unknown linter: :bogus"))
                              (kondo-ratchet/fix! nil))
            "the test file is named, not the prod file")))))

(deftest ^:synchronized fix-rejects-nonempty-test-config-counts-test
  (let [dir          (.toFile (java.nio.file.Files/createTempDirectory
                               "kondo-ratchet-test"
                               (make-array java.nio.file.attribute.FileAttribute 0)))
        budgets      (doto (io/file dir "ratchets.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {}, :comment-exempt #{}})))
        modules      (doto (io/file dir "module-ratchets.edn")
                       (spit (kondo-ratchet/render-module-ratchets {})))
        test-budgets (doto (io/file dir "ratchets-test.edn")
                       (spit (kondo-ratchet/render {:ignore-counts {}, :config-counts {:a 1}, :comment-exempt #{}})))]
    (binding [kondo-ratchet/*ratchets-file*        (.getPath budgets)
              kondo-ratchet/*module-ratchets-file* (.getPath modules)
              kondo-ratchet/*test-ratchets-file*   (.getPath test-budgets)]
      (mt/with-dynamic-fn-redefs [kondo-ratchet/known-linters (constantly #{:a})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              (re-pattern (str (java.util.regex.Pattern/quote (.getPath test-budgets))
                                               " must not set :config-counts -- config-level suppressions"
                                               " are tracked only in "
                                               (java.util.regex.Pattern/quote (.getPath budgets))))
                              (kondo-ratchet/fix! nil)))))))

(deftest read-ratchets-requires-one-map-test
  (doseq [[content message] [[""                       #"is empty; expected one map"]
                             ["  \n;; only a comment\n" #"is empty; expected one map"]
                             ["[:not :a :map]"          #"must hold a map of policies, not \[:not :a :map\]"]
                             ["{:ignore-counts {}} {}"  #"holds more than one form"]]]
    (let [file (doto (java.io.File/createTempFile "kondo-ratchets" ".edn")
                 (spit content))]
      (binding [kondo-ratchet/*ratchets-file* (.getPath file)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                              (kondo-ratchet/read-ratchets))
            (str (pr-str content) " must not read as an empty policy set")))))
  (doseq [content ["{:disabled true}"
                   ";; leading comment\n{:ignore-counts {:a 1}} ;; trailing comment\n"]]
    (let [file (doto (java.io.File/createTempFile "kondo-ratchets" ".edn")
                 (spit content))]
      (binding [kondo-ratchet/*ratchets-file* (.getPath file)]
        (is (map? (kondo-ratchet/read-ratchets))
            (str (pr-str content) " is one map, with or without comments around it"))))))

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
;;;; Known-linter unit tests
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel builtin-linters-test
  (let [builtin (kondo-ratchet/builtin-linters)]
    (is (every? builtin [:unused-binding :redundant-ignore :unresolved-namespace])
        "the pinned jar's default config names kondo's own linters")
    (is (not-any? builtin [:metabase/modules :unresolved-require])
        "repository linters and made-up names are not built-ins")))

(deftest ^:parallel discouraged-symbols-test
  (let [config '{:linters      {:discouraged-var       {a/x {:message "no"}, a/y {:message "no"}}
                                :discouraged-namespace {some.ns {:message "no"}}}
                 :config-in-ns {scope-a {:linters {:discouraged-var {a/x {:level :off}, b/z {:message "no"}}}}}
                 :config-in-call
                 {scope-b {:linters {:discouraged-namespace {other.ns {:message "no"}}}}}}]
    (is (= #{'a/x 'a/y 'b/z}
           (kondo-ratchet/discouraged-symbols :discouraged-var config))
        "scopes are unioned by symbol -- a symbol appearing at the top level and again under a scope
         (a/x) counts once, and a symbol that exists only under a scope (b/z) still counts")
    (is (= #{'some.ns 'other.ns}
           (kondo-ratchet/discouraged-symbols :discouraged-namespace config)))
    (is (= #{} (kondo-ratchet/discouraged-symbols :discouraged-var {})))))

(deftest ^:parallel discouraged-count-key-test
  (are [sym expected] (= expected (kondo-ratchet/discouraged-count-key sym))
    'metabase.entity-retrieval.core/search-unfiltered
    :entity-retrieval.core/search-unfiltered

    ;; `ee.`, not dropped outright: an OSS namespace and its enterprise mirror of the same shape must
    ;; not collapse onto the same key
    'metabase-enterprise.entity-retrieval.core/search-unfiltered
    :ee.entity-retrieval.core/search-unfiltered

    'clojure.core/println
    :clojure.core/println

    ;; a bare namespace symbol (:discouraged-namespace) has no name segment to split out
    'clojure.tools.logging
    :clojure.tools.logging

    'metabase.legacy-mbql.normalize
    :legacy-mbql.normalize))

(deftest ^:parallel discouraged-count-keys-test
  (let [config '{:linters {:discouraged-var {a/x {:message "no"}, a/y {:message "no"}}}}]
    (is (= #{:a/x :a/y}
           (kondo-ratchet/discouraged-count-keys :discouraged-var config)))))

(deftest ^:parallel discouraged-count-field-test
  (is (= :discouraged-var-counts (kondo-ratchet/discouraged-count-field :discouraged-var)))
  (is (= :discouraged-namespace-counts (kondo-ratchet/discouraged-count-field :discouraged-namespace))))

(deftest ^:parallel discouraged-in-ignore-counts-test
  (is (= #{:discouraged-namespace :discouraged-var}
         (kondo-ratchet/discouraged-in-ignore-counts {:discouraged-var 132, :a 1, :discouraged-namespace 68})))
  (is (= #{} (kondo-ratchet/discouraged-in-ignore-counts {:a 1, :b 2}))))

(deftest resolve-seed-test
  (mt/with-dynamic-fn-redefs [kondo-ratchet/discouraged-count-keys (constantly #{:a/x :ee.b/y})]
    (testing "an ordinary linter seeds itself in :ignore-counts"
      (is (= {:ignore-counts [:some-linter]}
             (#'kondo-ratchet/resolve-seed ":some-linter"))))
    (testing "a bare discouragement linter seeds every configured symbol in its own field"
      (is (= {:discouraged-var-counts [:a/x :ee.b/y], :bulk #{:discouraged-var-counts}}
             (#'kondo-ratchet/resolve-seed ":discouraged-var"))))
    (testing "a symbol suffix seeds that symbol, named either way"
      (is (= {:discouraged-var-counts [:ee.b/y]}
             (#'kondo-ratchet/resolve-seed ":discouraged-var/metabase-enterprise.b/y")
             (#'kondo-ratchet/resolve-seed ":discouraged-var/ee.b/y"))))
    (testing "an unconfigured or empty symbol suffix throws instead of seeding"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"a/nope\" is not a symbol configured under :discouraged-var"
                            (#'kondo-ratchet/resolve-seed ":discouraged-var/a/nope")))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"\"\" is not a symbol configured under :discouraged-var"
                            (#'kondo-ratchet/resolve-seed ":discouraged-var/"))))
    (testing "nil seeds nothing"
      (is (= {} (#'kondo-ratchet/resolve-seed nil))))))

(deftest ^:parallel discouraged-count-keys-collision-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #":discouraged-var symbols a/x, metabase.a/x share the ratchet key :a/x"
                        (kondo-ratchet/discouraged-count-keys
                         :discouraged-var
                         '{:linters {:discouraged-var {a/x {}, metabase.a/x {}}}}))))

(defn- git-in
  "Run git in `dir`, failing the test on a nonzero exit."
  [dir & args]
  (let [{:keys [exit err]} (apply sh/sh "git" (concat args [:dir dir]))]
    (is (zero? exit) (str "git " (str/join " " args) ": " err))))

(deftest ^:parallel repository-linters-test
  (let [dir (.toFile (java.nio.file.Files/createTempDirectory
                      "kondo-ratchet-linters-test"
                      (make-array java.nio.file.attribute.FileAttribute 0)))]
    (git-in dir "init" "-q")
    (spit (io/file dir "config.edn")
          (pr-str '{:linters      {:custom/top {:level :warning}}
                    :config-in-ns {some.ns {:linters {:custom/scoped {:level :off}}}}
                    :hooks        {:analyze-call {foo/bar hooks.foo/bar}}}))
    (.mkdirs (io/file dir "some-lib" "some-lib"))
    (spit (io/file dir "some-lib" "some-lib" "config.edn")
          (pr-str '{:linters {:custom/lib {:level :error}}}))
    (spit (io/file dir "not-config.txt") "{:linters {:custom/ignored {}}}")
    (spit (io/file dir "deleted.edn") (pr-str '{:linters {:custom/deleted {:level :error}}}))
    (git-in dir "add" "config.edn" "some-lib" "not-config.txt" "deleted.edn")
    (.delete (io/file dir "deleted.edn"))
    (.mkdirs (io/file dir "copied-lib" "copied-lib"))
    (spit (io/file dir "copied-lib" "copied-lib" "config.edn")
          (pr-str '{:linters {:custom/untracked {:level :error}}}))
    (.mkdirs (io/file dir ".cache" "v1"))
    (spit (io/file dir ".cache" "v1" "junk.edn") "<not edn>")
    (is (= #{:custom/top :custom/scoped :custom/lib}
           (kondo-ratchet/repository-linters (.getPath dir)))
        "top-level and scoped :linters maps count, in nested directories too; untracked files (the configs
         kondo copies in for dependencies, its cache), non-edn files, and tracked files deleted from the
         worktree do not"))
  (testing "the repository's own hook linters are found"
    (is (contains? (kondo-ratchet/repository-linters) :metabase/modules))))

(deftest ^:parallel known-linters-test
  (let [known (kondo-ratchet/known-linters)]
    (is (every? known [:unused-binding :metabase/modules :clojure-lsp/unused-public-var :all])
        "built-ins, repository linters, external diagnostics, and the vector-less :all form")
    (is (not (contains? known :unresolved-require))
        "a linter that never existed stays unknown")))

(deftest ^:parallel unknown-linters-test
  (let [known #{:a :b :c}]
    (is (= #{}
           (kondo-ratchet/unknown-linters {:ignore-counts  {:a 1, :b :unlimited}
                                           :config-counts  {:c 2}
                                           :comment-exempt #{:a}}
                                          known)))
    (is (= #{:x/ignored :y-config :z-exempt}
           (kondo-ratchet/unknown-linters {:ignore-counts  {:a 1, :x/ignored 1}
                                           :config-counts  {:y-config 2}
                                           :comment-exempt #{:z-exempt}}
                                          known))
        "each policy collection is checked")))

(deftest validate-linters-test
  (binding [kondo-ratchet/*ratchets-file* "r.edn"]
    (is (nil? (kondo-ratchet/validate-linters! {:ignore-counts {:a 1}, :config-counts {}, :comment-exempt #{}}
                                               #{:a})))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"^r.edn names 3 unknown linters: :b, :c/d, :e -- policies must name"
                          (kondo-ratchet/validate-linters! {:ignore-counts  {:e 1, :a 2}
                                                            :config-counts  {:c/d 1}
                                                            :comment-exempt #{:b}}
                                                           #{:a}))
        "one error lists every unknown name in order")))

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
         line 4's :all is not exempt"))
  (testing "the count policy plays no part: only :comment-exempt waives the comment"
    (let [occurrence {:file "f.clj", :line 1, :linters [:free], :justified? false}]
      (is (= [occurrence] (kondo-ratchet/unjustified #{} [occurrence])))
      (is (= [] (kondo-ratchet/unjustified #{:free} [occurrence]))))))

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

(deftest ^:parallel count-drift-test
  (is (= {:gone {:recorded 2, :actual 0}
          :new  {:recorded 0, :actual 1}
          :up   {:recorded 1, :actual 3}}
         (kondo-ratchet/count-drift {:gone 2, :same 5, :up 1}
                                    {:same 5, :new 1, :up 3}))))

(defn- merge-policies
  "[[kondo-ratchet/merge-ratchets]] over `:ignore-counts` maps alone, so a test reads as the three stages."
  [base ours theirs]
  (:ignore-counts (kondo-ratchet/merge-ratchets {:ignore-counts base}
                                                {:ignore-counts ours}
                                                {:ignore-counts theirs})))

(deftest ^:parallel merge-ratchets-one-sided-changes-test
  (testing "a change on one side wins over the unchanged base, whether it adds, lowers, or removes a policy"
    (is (= {:ours-add 2, :ours-lower 3, :theirs-add 3, :theirs-raise 9, :theirs-unlimited :unlimited}
           (merge-policies {:ours-lower 5, :ours-drop 4, :theirs-raise 5, :theirs-unlimited 1}
                           {:ours-add 2, :ours-lower 3, :theirs-raise 5, :theirs-unlimited 1}
                           {:ours-lower       5
                            :ours-drop        4
                            :theirs-add       3
                            :theirs-raise     9
                            :theirs-unlimited :unlimited}))))
  (testing "the same change on both sides is not a conflict"
    (is (= {:both 2}
           (merge-policies {:both 5, :both-drop 1} {:both 2} {:both 2})))))

(deftest ^:parallel merge-ratchets-concurrent-changes-take-the-stricter-policy-test
  (testing "concurrent finite budgets resolve to the smaller number"
    (is (= {:a 4} (merge-policies {:a 9} {:a 6} {:a 4})))
    (is (= {:a 4} (merge-policies {:a 9} {:a 4} {:a 6}))))
  (testing "a finite budget is stricter than :unlimited, whichever side chose it"
    (is (= {:a 4} (merge-policies {:a 9} {:a :unlimited} {:a 4})))
    (is (= {:a 4} (merge-policies {:a 9} {:a 4} {:a :unlimited})))
    (is (= {:a 2} (merge-policies {:a :unlimited} {:a 2} {:a 7}))))
  (testing "a removed policy allows nothing, so it is stricter than any concurrent change"
    (is (= {} (merge-policies {:a 5} {} {:a 4})))
    (is (= {} (merge-policies {:a 5} {:a :unlimited} {})))))

(deftest ^:parallel merge-ratchets-config-counts-test
  (is (= {:config-counts {:lowered 1, :ours-add 2, :theirs-add 3}}
         (select-keys (kondo-ratchet/merge-ratchets
                       {:config-counts {:lowered 4, :dropped 1}}
                       {:config-counts {:lowered 2, :ours-add 2}}
                       {:config-counts {:lowered 1, :dropped 1, :theirs-add 3}})
                      [:config-counts]))))

(deftest ^:parallel merge-module-ratchets-test
  (is (= {:lowered 1, :ours-add 2, :theirs-add 3}
         (kondo-ratchet/merge-module-ratchets
          {:lowered 4, :dropped 1}
          {:lowered 2, :ours-add 2}
          {:lowered 1, :dropped 1, :theirs-add 3}))))

(deftest ^:parallel merge-ratchets-absent-base-test
  (testing "with no base stage, each policy is a one-sided addition and shared linters take the stricter"
    (is (= {:ignore-counts                {:ours 2, :shared 3, :theirs 3}
            :discouraged-var-counts       {}
            :discouraged-namespace-counts {}
            :config-counts                {}
            :comment-exempt               #{:ours :theirs}}
           (kondo-ratchet/merge-ratchets
            {}
            {:ignore-counts {:ours 2, :shared :unlimited}, :comment-exempt #{:ours}}
            {:ignore-counts {:theirs 3, :shared 3}, :comment-exempt #{:theirs}})))))

(deftest ^:parallel merge-ratchets-comment-exempt-test
  (testing "exemptions follow the side that changed them"
    (is (= #{:kept :ours-add :theirs-add}
           (:comment-exempt (kondo-ratchet/merge-ratchets
                             {:comment-exempt #{:kept :ours-drop :theirs-drop}}
                             {:comment-exempt #{:kept :theirs-drop :ours-add}}
                             {:comment-exempt #{:kept :ours-drop :theirs-add}})))))
  (testing "exemptions merge independently of the same linter's count policy"
    (is (= {:ignore-counts                {:a 3}
            :discouraged-var-counts       {}
            :discouraged-namespace-counts {}
            :config-counts                {}
            :comment-exempt               #{:a}}
           (kondo-ratchet/merge-ratchets
            {:ignore-counts {:a 5}, :comment-exempt #{}}
            {:ignore-counts {:a 3}, :comment-exempt #{}}
            {:ignore-counts {:a :unlimited}, :comment-exempt #{:a}})))))

(deftest ^:parallel merge-ratchets-render-round-trip-test
  (let [merged (kondo-ratchet/merge-ratchets
                {:ignore-counts {:a 5, :equal :unlimited, :old :unlimited, :one-sided 2}}
                {:ignore-counts {:a 4, :equal :unlimited, :one-sided :unlimited}}
                {:ignore-counts {:a             3
                                 :equal         :unlimited
                                 :old           :unlimited
                                 :one-sided     2
                                 :new           2
                                 :new-unlimited :unlimited}})]
    (is (= {:ignore-counts                {:a             3
                                           :equal         :unlimited
                                           :one-sided     :unlimited
                                           :new           2
                                           :new-unlimited :unlimited}
            :discouraged-var-counts       {}
            :discouraged-namespace-counts {}
            :config-counts                {}
            :comment-exempt               #{}}
           merged
           (edn/read-string (kondo-ratchet/render merged)))
        "rendering the merged policies preserves bounded and unlimited linters")))

(deftest ^:parallel merge-ratchets-disabled-stages-test
  (testing "a target that disables ratchets stays disabled"
    (is (= {:disabled true}
           (kondo-ratchet/merge-ratchets {:ignore-counts {:a 1}} {:disabled true} {:ignore-counts {:a 1}}))))
  (testing "an incoming disabled form leaves the target as it is"
    (is (= {:ignore-counts {:a 1}, :config-counts {}, :comment-exempt #{}}
           (kondo-ratchet/merge-ratchets
            {:ignore-counts {:a 1}}
            {:ignore-counts {:a 1}, :config-counts {}, :comment-exempt #{}}
            {:disabled true}))))
  (testing "every stage is validated before a disabled stage decides the result"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"unsupported ratchet fields: #\{:budgets\}"
                          (kondo-ratchet/merge-ratchets {:ignore-counts {:a 1}}
                                                        {:disabled true}
                                                        {:budgets {:a 1}})))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"unsupported ratchet fields: #\{:budgets\}"
                          (kondo-ratchet/merge-ratchets {:budgets {:a 1}}
                                                        {:ignore-counts {:a 1}}
                                                        {:disabled true})))))

(deftest ^:parallel merge-ratchets-malformed-stage-test
  (testing "an unknown field"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"unsupported ratchet fields: #\{:extra\}"
                          (kondo-ratchet/merge-ratchets
                           {:ignore-counts {:a 1}}
                           {:ignore-counts {:a 1}, :extra 1}
                           {:ignore-counts {:a 1}}))))
  (testing "a malformed policy field is an error, never an empty set of policies"
    (doseq [[stage message] [[nil                        #"stage must be a map of policies"]
                             [[:a 1]                     #"stage must be a map of policies"]
                             [{:config-counts []}          #":config-counts must be a map"]
                             [{:comment-exempt []}         #":comment-exempt must be a set"]
                             [{:ignore-counts {:a -1}}     #"non-negative integer or :unlimited"]
                             [{:config-counts {:a :never}} #"expected a non-negative integer"]]
            :let           [well-formed {:ignore-counts {:a 1}, :config-counts {:a 1}, :comment-exempt #{:a}}]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                            (kondo-ratchet/merge-ratchets well-formed well-formed stage))
          (str (pr-str stage) " as the incoming stage"))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                            (kondo-ratchet/merge-ratchets stage well-formed {:disabled true}))
          (str (pr-str stage) " as the base, even when the incoming stage is disabled")))))

(deftest ^:parallel change-report-test
  (let [occurrences (concat (for [[linter n] {:lower 3, :over 7, :new 9, :same 4, :free 2}
                                  i          (range n)]
                              {:file "f.clj", :line (inc i), :linters [linter], :justified? false})
                            [{:file "g.clj", :line 1, :linters [:polite], :justified? true}])
        attribution {:actual       {:discouraged-var       {:dv-lower 2, :dv-over 4, :dv-same 3, :dv-new 1}
                                    :discouraged-namespace {:dn-over 3}}
                     :unattributed [{:file "h.clj", :line 9, :linters [:discouraged-var]}]}]
    (is (= ["seeded :new at 9"
            "WARNING: :void has no inline ignores -- nothing to seed"
            "dropped :gone (no ignores left)"
            "lowered :lower 5 -> 3"
            "WARNING: :over is over budget (5 recorded, 7 actual) -- remove ignores, or accept them all with `--seed :over`"
            "dropped :zero (no ignores left)"
            "WARNING: :unlimited policies with no ignores left: :empty -- delete an entry by hand once its linter no longer needs one"
            "WARNING: :dn-over is over budget (1 recorded, 3 actual) -- remove ignores, or accept them all with `--seed :discouraged-namespace/dn-over`"
            "dropped :dv-gone (no ignores left)"
            "lowered :dv-lower 5 -> 2"
            "WARNING: :dv-over is over budget (1 recorded, 4 actual) -- remove ignores, or accept them all with `--seed :discouraged-var/dv-over`"
            "WARNING: :dv-new has 1 ignores but no budget entry -- seed one with `./bin/mage kondo-ratchets-shrink --seed :discouraged-var/dv-new`"
            "WARNING: h.clj:9 ignores :discouraged-var but kondo reports no such finding under it -- probably stale, under a nested ignore for the same linter, or in a reader branch kondo skips"
            "dropped config :cfg-gone (no suppressions left)"
            "lowered config :cfg-lower 4 -> 2"
            "WARNING: config suppressions for :cfg-over are over budget (1 recorded, 3 actual) -- remove one from .clj-kondo/config.edn or raise the budget by hand"
            "lowered module :api-any 2 -> 1"
            "WARNING: module :uses-any is over budget (1 recorded, 2 actual) -- remove one from .clj-kondo/config/modules/config.edn or raise the budget by hand"
            "WARNING: :comment-exempt is no longer needed for these linters: :polite -- delete the stale entries by hand"]
           (kondo-ratchet/change-report {:ignore-counts                {:empty  :unlimited
                                                                        :free   :unlimited
                                                                        :gone   5
                                                                        :lower  5
                                                                        :over   5
                                                                        :polite 1
                                                                        :same   4
                                                                        :zero   0}
                                         :discouraged-var-counts       {:dv-gone  2
                                                                        :dv-lower 5
                                                                        :dv-over  1
                                                                        :dv-same  3}
                                         :discouraged-namespace-counts {:dn-over 1}
                                         :config-counts                {:cfg-gone  2
                                                                        :cfg-lower 4
                                                                        :cfg-over  1
                                                                        :cfg-same  6}
                                         :comment-exempt               #{:lower :polite}}
                                        {:api-any 2, :uses-any 1}
                                        occurrences
                                        attribution
                                        {:cfg-lower 2, :cfg-over 3, :cfg-same 6}
                                        {:api-any 1, :uses-any 2}
                                        {:ignore-counts [:new :void]}))
        "untouched budgets (:same, :cfg-same, :dv-same), a used unlimited policy (:free), and a still-needed
         exemption (:lower) earn no line; a hand-written 0 (:zero) is dropped like any bounded budget with no
         ignores left; the empty unlimited policy (:empty) is kept and warned about; per-symbol fields report
         like :ignore-counts, suggesting a per-symbol seed; an unattributed ignore gets its own warning"))
  (testing "a per-symbol seed reports under its own field only"
    (is (= ["seeded :dv-new at 1"]
           (kondo-ratchet/change-report {:ignore-counts {}, :config-counts {}, :comment-exempt #{}}
                                        {}
                                        []
                                        {:actual {:discouraged-var {:dv-new 1}}}
                                        {}
                                        {}
                                        {:discouraged-var-counts [:dv-new]})))))

(deftest ^:parallel shrink-summary-test
  (is (= (str "{:a                      2 => 1\n"
              " :config/unused-import   4 => 0\n"
              " :module/friend-edges    3 => 2\n"
              " :z                     10 => 3}")
         (kondo-ratchet/shrink-summary
          {:ignore-counts {:a 2, :same 1, :unlimited :unlimited, :z 10}
           :config-counts {:same 2, :unused-import 4}
           :module-counts {:friend-edges 3}
           :comment-exempt #{:a}}
          {:ignore-counts {:a 1, :raised 2, :same 1, :unlimited :unlimited, :z 3}
           :config-counts {:same 2}
           :module-counts {:friend-edges 2}
           :comment-exempt #{}})))
  (is (= "{}" (kondo-ratchet/shrink-summary {:ignore-counts {:a 1}}
                                            {:ignore-counts {:a 2}}))
      "increases and non-count policy changes aren't reported"))

(deftest ^:synchronized shrink-pr-body-test
  (let [before {:ignore-counts {:case-symbol-test 2}}
        after  {:ignore-counts {:case-symbol-test 1}}
        body   #(mt/with-dynamic-fn-redefs [rand-nth (constantly %)]
                  (kondo-ratchet/shrink-pr-body before after "https://example.test/run/1"))]
    (is (str/includes? (body ["# still our problem" ". fixed, so no longer our problem"])
                       "{:case-symbol-test  2 => 1}"))
    (is (str/includes? (body ["# stubborn lint" ". lint successfully rolled"])
                       "# stubborn lint\n  . lint successfully rolled"))
    (is (str/includes? (body ["# TODO" ". TODONE"])
                       "# TODO\n  . TODONE"))
    (is (str/includes? (body ["# still our problem" ". fixed, so no longer our problem"])
                       "[`./bin/mage kondo-ratchets-shrink`](https://example.test/run/1)"))))

(deftest ^:synchronized shrink-pr-body-from-files-test
  (let [dir   (.toFile (java.nio.file.Files/createTempDirectory
                        "kondo-ratchet-test"
                        (make-array java.nio.file.attribute.FileAttribute 0)))
        write (fn [file-name text] (.getPath (doto (io/file dir file-name) (spit text))))
        prod  (fn [n] (kondo-ratchet/render {:ignore-counts {:a n}, :config-counts {}, :comment-exempt #{}}))
        paths {:before         (write "before.edn" (prod 3))
               :after          (write "after.edn" (prod 2))
               :modules-before (write "modules-before.edn" (kondo-ratchet/render-module-ratchets {:friend-edges 5}))
               :modules-after  (write "modules-after.edn" (kondo-ratchet/render-module-ratchets {:friend-edges 4}))
               :test-before    (write "test-before.edn" (prod 7))
               :test-after     (write "test-after.edn" (prod 6))}]
    (try
      (let [body (kondo-ratchet/shrink-pr-body-from-files paths "https://example.test/run/1")]
        (is (re-find #":a\s+3 => 2" body))
        (is (re-find #":module/friend-edges\s+5 => 4" body))
        (is (re-find #":test/a\s+7 => 6" body)))
      (finally
        (run! io/delete-file (reverse (file-seq dir)))))))
