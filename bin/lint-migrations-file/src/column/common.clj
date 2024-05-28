(ns column.common
  (:require
   [clojure.spec.alpha :as s]))

(s/def ::name string?)
(s/def ::type string?)
(s/def ::remarks string?)

(s/def :column.common.constraints/onDelete
  #_{:clj-kondo/ignore [:unused-value]}
  (fn [_]
    "Don't try to use onDelete in constraints! onDelete is only for addForeignKeyConstraints. Use deleteCascade!"
    false))

(s/def ::constraints
  ;; TODO -- require foreignKeyName if this is an FK
  (s/keys :opt-un [:column.common.constraints/nullable
                   :column.common.constraints/references
                   :column.common.constraints/foreignKeyName
                   :column.common.constraints/deferrable
                   :column.common.constraints/initiallyDeferred
                   :column.common.constraints/deleteCascade
                   :column.common.constraints/onDelete]))

(s/def ::column
  (s/keys :req-un [::name ::type]
          :opt-un [::remarks ::constraints]))
