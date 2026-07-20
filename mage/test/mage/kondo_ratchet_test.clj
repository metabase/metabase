(ns mage.kondo-ratchet-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.kondo-ratchet :as kondo-ratchet]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(deftest insert-ignore-lines-test
  (testing "inserts at the flagged line's indentation"
    (is (= "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
           (#'kondo-ratchet/insert-ignore-lines "(defn f [x]\n  (= true x))\n" {2 [:equals-true]}))))
  (testing "multiple rows insert bottom-up so earlier rows stay valid; same-row linters share one form"
    (is (= (str "#_{:clj-kondo/ignore [:x]}\n"
                "(a)\n"
                "#_{:clj-kondo/ignore [:x :y]}\n"
                "(b)\n")
           (#'kondo-ratchet/insert-ignore-lines "(a)\n(b)\n" {1 [:x], 2 [:y :x :y]}))))
  (testing "a file without a trailing newline doesn't gain one"
    (is (= "#_{:clj-kondo/ignore [:x]}\n(a)"
           (#'kondo-ratchet/insert-ignore-lines "(a)" {1 [:x]}))))
  (testing "a row in row->comment gets its comment above the ignore, at the same indentation"
    (is (= (str "(defn f [x]\n"
                "  ;; why\n"
                "  #_{:clj-kondo/ignore [:equals-true]}\n"
                "  (= true x))\n")
           (#'kondo-ratchet/insert-ignore-lines "(defn f [x]\n  (= true x))\n"
                                                {2 [:equals-true]}
                                                {2 ";; why"}))))
  (testing "rows absent from row->comment get no comment"
    (is (= "#_{:clj-kondo/ignore [:x]}\n(a)\n;; why\n#_{:clj-kondo/ignore [:y]}\n(b)\n"
           (#'kondo-ratchet/insert-ignore-lines "(a)\n(b)\n" {1 [:x], 2 [:y]} {2 ";; why"})))))

(deftest insert-inline-ignores-test
  (testing "splices directly before the flagged token, wherever it sits on the line"
    (is (= "{:engine #_{:clj-kondo/ignore [:x]} :postgres}\n"
           (#'kondo-ratchet/insert-inline-ignores "{:engine :postgres}\n" {[1 10] [:x]} {}))))
  (testing "multiple tokens on one line each get their own splice, right-to-left"
    (is (= "(disj drivers #_{:clj-kondo/ignore [:x]} :presto #_{:clj-kondo/ignore [:x]} :databricks)\n"
           (#'kondo-ratchet/insert-inline-ignores "(disj drivers :presto :databricks)\n"
                                                  {[1 15] [:x], [1 23] [:x]}
                                                  {}))))
  (testing "a comment goes above the row at its indentation; same-site linters merge sorted"
    (is (= "(f\n  ;; why\n  #_{:clj-kondo/ignore [:x :y]} :mysql)\n"
           (#'kondo-ratchet/insert-inline-ignores "(f\n  :mysql)\n" {[2 3] [:y :x :y]} {2 ";; why"}))))
  (testing "a file without a trailing newline doesn't gain one"
    (is (= "#_{:clj-kondo/ignore [:x]} (a)"
           (#'kondo-ratchet/insert-inline-ignores "(a)" {[1 1] [:x]} {})))))

(deftest strip-orphan-keep-comments-test
  (let [keep-line (str ";; " kondo-ratchet/keep-marker " suppresses a warning")]
    (testing "a whole-line marker comment with no ignore below it is dropped"
      (is (= "(a)\n(b)\n"
             (#'kondo-ratchet/strip-orphan-keep-comments (str "(a)\n" keep-line "\n(b)\n")))))
    (testing "a marker comment still above an ignore survives"
      (let [text (str keep-line "\n#_{:clj-kondo/ignore [:x]}\n(a)\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "comments without the marker survive, orphaned or not"
      (let [text ";; plain comment\n(a)\n"]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "a trailing marker on a code line is left for a hand fix"
      (let [text (str "(foo) " keep-line "\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "a marker orphaned at the last line of the file is dropped"
      (is (= "(a)\n"
             (#'kondo-ratchet/strip-orphan-keep-comments (str "(a)\n" keep-line "\n")))))
    (testing "a marker above an ignore whose linter vector wraps to the next line survives"
      (let [text (str keep-line "\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(a)\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))
    (testing "a marker separated from its ignore by another comment line survives"
      (let [text (str keep-line "\n;; more context\n#_{:clj-kondo/ignore [:x]}\n(a)\n")]
        (is (= text (#'kondo-ratchet/strip-orphan-keep-comments text)))))))

(deftest beyond-baseline-test
  (let [f (fn [filename row type col] {:filename filename, :row row, :type type, :col col})]
    (testing "findings with no baseline entry are all beyond it"
      (is (= [(f "a.clj" 3 :x 1)]
             (#'kondo-ratchet/beyond-baseline {} [(f "a.clj" 3 :x 1)]))))
    (testing "a group matching its baseline count is fully absorbed"
      (is (= []
             (#'kondo-ratchet/beyond-baseline {["a.clj" 3 :x] 1} [(f "a.clj" 3 :x 1)]))))
    (testing "a group over its baseline count returns ALL its findings -- an exposed finding can't be
              told apart from a pre-existing same-row one, so restore conservatively"
      (is (= [(f "a.clj" 3 :x 1) (f "a.clj" 3 :x 20)]
             (sort-by :col
                      (#'kondo-ratchet/beyond-baseline {["a.clj" 3 :x] 1}
                                                       [(f "a.clj" 3 :x 20) (f "a.clj" 3 :x 1)])))))))

(deftest shift-past-inserts-test
  (testing "each insertion at or above the row pushes it down one, measured against the original row"
    (is (= 5 (#'kondo-ratchet/shift-past-inserts 5 [])))
    (is (= 6 (#'kondo-ratchet/shift-past-inserts 5 [5 6])))
    (is (= 9 (#'kondo-ratchet/shift-past-inserts 7 [5 6])))
    (is (= 5 (#'kondo-ratchet/shift-past-inserts 5 [6 7])))))

(deftest marker-on-line-test
  (testing "the marker counts only after a semicolon, so a string literal containing it doesn't mark"
    (is (true? (#'kondo-ratchet/marker-on-line? (str ";; " kondo-ratchet/keep-marker " because"))))
    (is (true? (#'kondo-ratchet/marker-on-line? (str "(foo) ;; " kondo-ratchet/keep-marker))))
    (is (false? (#'kondo-ratchet/marker-on-line? (str "(def marker \"" kondo-ratchet/keep-marker "\")"))))
    (is (false? (#'kondo-ratchet/marker-on-line? nil)))))

(deftest remove-ignores-at-test
  (testing "a standalone ignore line disappears entirely; :sites points at the uncovered form"
    (is (= {:text      "(defn f [x]\n  (= true x))\n"
            :sites     [{:row 2, :linters [:equals-true]}]
            :deletions [[2 1]]
            :skipped   []}
           (#'kondo-ratchet/remove-ignores-at
            "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
            [2]))))
  (testing "an inline ignore is cut out of its line, swallowing a doubled space"
    (is (= {:text "(do (foo))\n", :sites [{:row 1, :linters [:x]}], :deletions [[1 0]], :skipped []}
           (#'kondo-ratchet/remove-ignores-at "(do #_{:clj-kondo/ignore [:x]} (foo))\n" [1]))))
  (testing "a multi-line ignore vector goes too"
    (is (= {:text "(a)\n(b)\n", :sites [{:row 2, :linters [:x :y]}], :deletions [[2 2]], :skipped []}
           (#'kondo-ratchet/remove-ignores-at "(a)\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(b)\n" [2]))))
  (testing "an ignore map with extra keys is removed whole, not truncated at the vector"
    (is (= {:text "(a)\n", :sites [{:row 1, :linters [:x]}], :deletions [[1 1]], :skipped []}
           (#'kondo-ratchet/remove-ignores-at "#_{:clj-kondo/ignore [:x] :reason \"legacy\"}\n(a)\n" [1]))))
  (testing "an extra-key map with NESTED braces would be truncated by the regex, so it is skipped whole"
    (is (= {:text      "#_{:clj-kondo/ignore [:x] :reason {:ticket \"ABC-1\"}}\n(a)\n"
            :sites     []
            :deletions []
            :skipped   [1]}
           (#'kondo-ratchet/remove-ignores-at
            "#_{:clj-kondo/ignore [:x] :reason {:ticket \"ABC-1\"}}\n(a)\n"
            [1]))))
  (testing "a skipped row is reported in post-removal coordinates when removals above it delete lines"
    (is (= {:text      "(a)\n#_{:clj-kondo/ignore [:y] :reason {:nested 1}}\n(b)\n"
            :sites     [{:row 1, :linters [:x]}]
            :deletions [[1 1]]
            :skipped   [2]}
           (#'kondo-ratchet/remove-ignores-at
            "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y] :reason {:nested 1}}\n(b)\n"
            [1 3]))))
  (testing "any form naming a clojure-lsp/* linter survives — a re-lint could never restore that half"
    (is (= {:text      (str "(do #_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]} (foo))\n"
                            "#_{:clj-kondo/ignore [:x :clojure-lsp/unused-public-var]}\n"
                            "(bar)\n")
            :sites     [{:row 1, :linters [:x]}]
            :deletions [[1 0]]
            :skipped   []}
           (#'kondo-ratchet/remove-ignores-at
            (str "(do #_{:clj-kondo/ignore [:x]} #_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]} (foo))\n"
                 "#_{:clj-kondo/ignore [:x :clojure-lsp/unused-public-var]}\n"
                 "(bar)\n")
            [1 2]))))
  (testing "an inline removal of a wrapped ignore still counts its deleted newlines, shifting later rows"
    (is (= {:text      "(do (foo))\n(a)\n(b)\n"
            :sites     [{:row 3, :linters [:z]} {:row 1, :linters [:x :y]}]
            :deletions [[4 1] [1 1]]
            :skipped   []}
           (#'kondo-ratchet/remove-ignores-at
            "(do #_{:clj-kondo/ignore [:x\n                          :y]} (foo))\n(a)\n#_{:clj-kondo/ignore [:z]}\n(b)\n"
            [1 4]))))
  (testing "rows without an ignore are left alone; multiple removals shift later :sites rows up"
    (is (= {:text      "(a)\n(b)\n"
            :sites     [{:row 2, :linters [:y]} {:row 1, :linters [:x]}]
            :deletions [[3 1] [1 1]]
            :skipped   []}
           (#'kondo-ratchet/remove-ignores-at
            "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y]}\n(b)\n"
            [1 2 3])))))
