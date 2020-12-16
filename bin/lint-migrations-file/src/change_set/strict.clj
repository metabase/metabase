(ns change-set.strict
  (:require change-set.common
            change.strict
            [clojure.spec.alpha :as s]))

(comment change-set.common/keep-me
         change.strict/keep-me)

;; comment is required for strict change set spec
(s/def ::comment
  (s/and
   string?
   (partial re-find #"Added [\d.x]+")))

;; only one change allowed per change set for the strict schema.
(s/def ::changes
  (s/alt :change :change.strict/change))

(s/def ::change-set
  (s/merge
   :change-set.common/change-set
   (s/keys :req-un [::changes ::comment])))
