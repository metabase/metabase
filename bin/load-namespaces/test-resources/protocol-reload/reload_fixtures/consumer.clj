(ns reload-fixtures.consumer
  (:require
   [reload-fixtures.proto :as proto]))

(defrecord Friend []
  proto/Greeter
  (greet [_this] "hi"))

(def friend (->Friend))
