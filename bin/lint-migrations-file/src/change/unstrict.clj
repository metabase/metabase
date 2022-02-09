(ns change.unstrict
  (:require change.common
            [clojure.spec.alpha :as s]
            column.unstrict))

(comment change.common/keep-me
         column.unstrict/keep-me)

(s/def ::column
  (s/keys :req-un [:column.unstrict/column]))

(s/def :change.unstrict.add-column/columns
  (s/alt :column ::column))

(s/def ::addColumn
  (s/merge
   :change.common/addColumn
   (s/keys :req-un [:change.unstrict.add-column/columns])))

(s/def ::remarks string?)

(s/def :change.unstrict.create-table/columns
  (s/+ (s/alt :column ::column)))

(s/def ::createTable
  (s/merge
   :change.common/createTable
   (s/keys :req-un [:change.unstrict.create-table/columns]
           :opt-un [::remarks])))

(s/def ::change
  (s/keys :opt-un [::addColumn ::createTable]))
