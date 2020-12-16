(ns change.strict
  (:require change.common
            [clojure.spec.alpha :as s]
            column.strict))

(comment change.common/keep-me
         column.strict/keep-me)

(s/def ::column
  (s/keys :req-un [:column.strict/column]))

(s/def :change.strict.add-column/columns
  (s/alt :column ::column))

(s/def ::addColumn
  (s/merge
   :change.common/addColumn
   (s/keys :req-un [:change.strict.add-column/columns])))

(s/def ::remarks
  string?)

(s/def :change.strict.create-table/columns
  (s/+ (s/alt :column ::column)))

(s/def ::createTable
  (s/merge
   :change.common/createTable
   ;; remarks are required for new tables in strict mode
   (s/keys :req-un [:change.strict.create-table/columns ::remarks])))

(s/def ::change
  (s/keys :opt-un [::addColumn ::createTable]))
