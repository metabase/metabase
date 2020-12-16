(ns change-set.common
  (:require [clojure.spec.alpha :as s]))

(s/def ::id
  (s/or
   :int int?
   :int-string (s/and
                string?
                (fn [^String s]
                  (try
                    (Integer/parseInt s)
                    (catch Throwable _
                      false))))))

(s/def ::author string?)

(s/def ::change-set
  (s/keys :req-un [::id ::author]))
