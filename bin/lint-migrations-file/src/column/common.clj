(ns column.common
  (:require [clojure.spec.alpha :as s]))

(s/def ::name string?)
(s/def ::type string?)
(s/def ::remarks string?)

(s/def ::column
  (s/keys :req-un [::name ::type]
          :opt-un [::remarks]))
