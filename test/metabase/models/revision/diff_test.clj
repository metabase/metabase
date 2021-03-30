(ns metabase.models.revision.diff-test
  (:require [clojure.data :as data]
            [clojure.test :refer :all]
            [metabase.models.revision.diff :as diff]))

(deftest rename-test
  (testing (str "Check that pattern matching allows specialization and that string only reflects the keys that have "
                "changed")
    (let [[before after] (data/diff {:name "Tips by State", :private false}
                                    {:name "Spots by State", :private false})]
      (is (= "renamed this card from \"Tips by State\" to \"Spots by State\"."
             (diff/diff-string "card" before after))))))

(deftest make-private-test
  (let [[before after] (data/diff {:name "Spots by State", :private false}
                                  {:name "Spots by State", :private true})]
    (is (= "made this card private."
           (diff/diff-string "card" before after)))))

(deftest change-priority-test
  (let [[before after] (data/diff {:priority "Important"}
                                  {:priority "Regular"})]
    (is (= "changed priority from \"Important\" to \"Regular\"."
           (diff/diff-string "card" before after)))))

(deftest multiple-changes-test
  (let [[before after] (data/diff {:name "Tips by State", :private false}
                                  {:name "Spots by State", :private true})]
    (is (= "made this card private and renamed it from \"Tips by State\" to \"Spots by State\"."
           (diff/diff-string "card" before after))))

  (let [[before after] (data/diff {:name "Tips by State", :private false, :priority "Important"}
                                  {:name "Spots by State", :private true, :priority "Regular"})]
    (is (= (str "changed priority from \"Important\" to \"Regular\", made this card private and renamed it from "
                "\"Tips by State\" to \"Spots by State\".")
           (diff/diff-string "card" before after)))))
