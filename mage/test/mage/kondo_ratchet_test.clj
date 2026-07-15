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
  (testing "a standalone ignore line disappears entirely; :form-rows points at the uncovered form"
    (is (= {:text "(defn f [x]\n  (= true x))\n", :form-rows [2]}
           (#'kondo-ratchet/remove-ignores-at
            "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
            [2]))))
  (testing "an inline ignore is cut out of its line, swallowing a doubled space"
    (is (= {:text "(do (foo))\n", :form-rows [1]}
           (#'kondo-ratchet/remove-ignores-at "(do #_{:clj-kondo/ignore [:x]} (foo))\n" [1]))))
  (testing "a multi-line ignore vector goes too"
    (is (= {:text "(a)\n(b)\n", :form-rows [2]}
           (#'kondo-ratchet/remove-ignores-at "(a)\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(b)\n" [2]))))
  (testing "rows without an ignore are left alone; multiple removals shift later :form-rows up"
    (is (= {:text "(a)\n(b)\n", :form-rows [2 1]}
           (#'kondo-ratchet/remove-ignores-at
            "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y]}\n(b)\n"
            [1 2 3])))))
