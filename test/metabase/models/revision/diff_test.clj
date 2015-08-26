(ns metabase.models.revision.diff-test
  (:require [metabase.models.revision.diff :refer :all]
            [expectations :refer :all]))


;; Check that pattern matching allows specialization and that string only reflects the keys that have changed
(expect "renamed this card from \"Tips by State\" to \"Spots by State\"."
  (diff-str "card"
            {:name "Tips by State", :private false}
            {:name "Spots by State", :private false}))

(expect "made this card private."
  (diff-str "card"
            {:name "Spots by State", :private false}
            {:name "Spots by State", :private true}))


;; Check the fallback sentence fragment for key without specialized sentence fragment
(expect "changed priority from \"Important\" to \"Regular\"."
  (diff-str "card"
            {:priority "Important"}
            {:priority "Regular"}))

;; Check that 2 changes are handled nicely
(expect "made this card private and renamed it from \"Tips by State\" to \"Spots by State\"."
  (diff-str "card"
            {:name "Tips by State", :private false}
            {:name "Spots by State", :private true}))

;; Check that several changes are handled nicely
(expect "changed priority from \"Important\" to \"Regular\", made this card private and renamed it from \"Tips by State\" to \"Spots by State\"."
  (diff-str "card"
            {:name "Tips by State", :private false, :priority "Important"}
            {:name "Spots by State", :private true, :priority "Regular"}))
