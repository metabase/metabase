(ns mage.kondo-ratchet-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [mage.kondo-ratchet :as kondo-ratchet]))

;; Referenced by core_test.clj to ensure namespace is loaded
(def keep-me :loaded)

(deftest insert-ignore-lines-test
  (testing "inserts at the flagged line's indentation"
    (is (= "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
           (#'kondo-ratchet/insert-ignore-lines "(defn f [x]\n  (= true x))\n" :equals-true [2]))))
  (testing "multiple rows insert bottom-up so earlier rows stay valid; same-row findings dedupe"
    (is (= (str "#_{:clj-kondo/ignore [:x]}\n"
                "(a)\n"
                "#_{:clj-kondo/ignore [:x]}\n"
                "(b)\n")
           (#'kondo-ratchet/insert-ignore-lines "(a)\n(b)\n" :x [1 2 2]))))
  (testing "a file without a trailing newline doesn't gain one"
    (is (= "#_{:clj-kondo/ignore [:x]}\n(a)"
           (#'kondo-ratchet/insert-ignore-lines "(a)" :x [1])))))

(deftest remove-ignores-at-test
  (testing "a standalone ignore line disappears entirely"
    (is (= "(defn f [x]\n  (= true x))\n"
           (#'kondo-ratchet/remove-ignores-at
            "(defn f [x]\n  #_{:clj-kondo/ignore [:equals-true]}\n  (= true x))\n"
            [2]))))
  (testing "an inline ignore is cut out of its line, swallowing a doubled space"
    (is (= "(do (foo))\n"
           (#'kondo-ratchet/remove-ignores-at "(do #_{:clj-kondo/ignore [:x]} (foo))\n" [1]))))
  (testing "a multi-line ignore vector goes too"
    (is (= "(a)\n(b)\n"
           (#'kondo-ratchet/remove-ignores-at "(a)\n#_{:clj-kondo/ignore [:x\n                      :y]}\n(b)\n" [2]))))
  (testing "rows without an ignore are left alone; multiple rows remove bottom-up"
    (is (= "(a)\n(b)\n"
           (#'kondo-ratchet/remove-ignores-at
            "#_{:clj-kondo/ignore [:x]}\n(a)\n#_{:clj-kondo/ignore [:y]}\n(b)\n"
            [1 2 3])))))
