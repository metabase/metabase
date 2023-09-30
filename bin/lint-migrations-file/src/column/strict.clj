(ns column.strict
  (:require
   [clojure.spec.alpha :as s]
   [column.common]))

(defmulti ^:private column-name :name)

;; remark is *required* for non-ID columns
(defmethod column-name :default
  [_]
  (s/merge
   :column.common/column
   (s/keys :req-un [:column.common/remarks])))

(defmethod column-name "id"
  [_]
  :column.common/column)

(s/def ::column
  (s/multi-spec column-name :name))
