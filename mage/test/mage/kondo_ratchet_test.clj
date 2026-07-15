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
           (#'kondo-ratchet/insert-ignore-lines "(a)" {1 [:x]})))))

(deftest remove-ignores-at-test
  (testing "a standalone ignore line disappears entirely; :sites points at the uncovered form"
    (is (= {:text "(defn f [x]\n  (= true x))\n", :sites [{:row 2, :linters [:equals-true]}], :skipped []}
           (#'kondo-ratchet/remove-ignores-at
            "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
            [2]))))
  (testing "an inline ignore is cut out of its line, swallowing a doubled space"
    (is (= {:text "(do (foo))\n", :sites [{:row 1, :linters [:x]}], :skipped []}
           (#'kondo-ratchet/remove-ignores-at "(do #_{:clj-kondo/ignore [:x]} (foo))\n" [1]))))
  (testing "a multi-line ignore vector goes too"
    (is (= {:text "(a)\n(b)\n", :sites [{:row 2, :linters [:x :y]}], :skipped []}
           (#'kondo-ratchet/remove-ignores-at "(a)\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(b)\n" [2]))))
  (testing "an ignore map with extra keys is removed whole, not truncated at the vector"
    (is (= {:text "(a)\n", :sites [{:row 1, :linters [:x]}], :skipped []}
           (#'kondo-ratchet/remove-ignores-at "#_{:clj-kondo/ignore [:x] :reason \"legacy\"}\n(a)\n" [1]))))
  (testing "an extra-key map with NESTED braces would be truncated by the regex, so it is skipped whole"
    (is (= {:text "#_{:clj-kondo/ignore [:x] :reason {:ticket \"ABC-1\"}}\n(a)\n", :sites [], :skipped [1]}
           (#'kondo-ratchet/remove-ignores-at
            "#_{:clj-kondo/ignore [:x] :reason {:ticket \"ABC-1\"}}\n(a)\n"
            [1]))))
  (testing "any form naming a clojure-lsp/* linter survives — a re-lint could never restore that half"
    (is (= {:text  (str "(do #_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]} (foo))\n"
                        "#_{:clj-kondo/ignore [:x :clojure-lsp/unused-public-var]}\n"
                        "(bar)\n")
            :sites [{:row 1, :linters [:x]}]
            :skipped []}
           (#'kondo-ratchet/remove-ignores-at
            (str "(do #_{:clj-kondo/ignore [:x]} #_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]} (foo))\n"
                 "#_{:clj-kondo/ignore [:x :clojure-lsp/unused-public-var]}\n"
                 "(bar)\n")
            [1 2]))))
  (testing "rows without an ignore are left alone; multiple removals shift later :sites rows up"
    (is (= {:text "(a)\n(b)\n", :sites [{:row 2, :linters [:y]} {:row 1, :linters [:x]}], :skipped []}
           (#'kondo-ratchet/remove-ignores-at
            "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y]}\n(b)\n"
            [1 2 3])))))
