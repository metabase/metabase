(ns change.strict
  (:require change.common
            [clojure.spec.alpha :as s]
            column.strict))

(comment change.common/keep-me
         column.strict/keep-me)

(s/def ::column
  (s/keys :req-un [:column.strict/column]))

(s/def ::columns
  (s/alt :column ::column))

(s/def ::addColumn
  (s/merge
   :change.common/addColumn
   (s/keys :req-un [::columns])))

(s/def ::change
  (s/keys :opt-un [::addColumn]))
