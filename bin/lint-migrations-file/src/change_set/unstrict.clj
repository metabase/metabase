(ns change-set.unstrict
  (:require change-set.common
            change.unstrict
            [clojure.spec.alpha :as s]))

(comment change-set.common/keep-me
         change.unstrict/keep-me)

(s/def ::comment string?)

;; unstrict change set: one or more changes
(s/def ::changes
  (s/+ :change.unstrict/change))

(s/def ::change-set
  (s/merge
   :change-set.common/change-set
   (s/keys :req-un [::changes]
           :opt-un [::comment])))
