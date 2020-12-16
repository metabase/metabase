(ns change.unstrict
  (:require change.common
            [clojure.spec.alpha :as s]
            column.unstrict))

(comment change.common/keep-me
         column.unstrict/keep-me)

(s/def ::column
  (s/keys :req-un [:column.unstrict/column]))

(s/def ::columns
  (s/alt :column ::column))

(s/def ::addColumn
  (s/merge
   :change.common/addColumn
   (s/keys :req-un [::columns])))

(s/def ::change
  (s/keys :opt-un [::addColumn]))
