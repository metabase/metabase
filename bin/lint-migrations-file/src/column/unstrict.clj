(ns column.unstrict
  (:require
   [clojure.spec.alpha :as s]
   [column.common]))

(comment column.common/keep-me)

(s/def ::column
  (s/merge
   :column.common/column))
