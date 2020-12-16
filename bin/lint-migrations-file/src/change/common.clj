(ns change.common
  (:require [clojure.spec.alpha :as s]))

(s/def ::tableName
  string?)

(s/def ::addColumn
  (s/keys :req-un [::tableName]))
