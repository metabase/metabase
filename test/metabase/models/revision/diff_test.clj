(ns metabase.models.revision.diff-test
  (:require [clojure.data :as data]
            [expectations :refer :all]
            [metabase.models.revision.diff :refer :all]))

;; Check that pattern matching allows specialization and that string only reflects the keys that have changed
(expect "renamed this card from \"Tips by State\" to \"Spots by State\"."
  (let [[before after] (data/diff {:name "Tips by State", :private false}
                                  {:name "Spots by State", :private false})]
    (diff-string "card" before after)))

(expect "made this card private."
  (let [[before after] (data/diff {:name "Spots by State", :private false}
                                  {:name "Spots by State", :private true})]
    (diff-string "card" before after)))

(expect "changed priority from \"Important\" to \"Regular\"."
  (let [[before after] (data/diff {:priority "Important"}
                                  {:priority "Regular"})]
    (diff-string "card" before after)))

(expect "made this card private and renamed it from \"Tips by State\" to \"Spots by State\"."
  (let [[before after] (data/diff {:name "Tips by State", :private false}
                                  {:name "Spots by State", :private true})]
    (diff-string "card" before after)))

(expect "changed priority from \"Important\" to \"Regular\", made this card private and renamed it from \"Tips by State\" to \"Spots by State\"."
  (let [[before after] (data/diff {:name "Tips by State", :private false, :priority "Important"}
                                  {:name "Spots by State", :private true, :priority "Regular"})]
    (diff-string "card" before after)))
