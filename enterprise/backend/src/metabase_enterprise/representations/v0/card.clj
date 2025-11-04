(ns metabase-enterprise.representations.v0.card)

(defn representation-type
  "Derive the representation type keyword from a t2 entity for a card."
  [t2-card]
  (:type t2-card))
