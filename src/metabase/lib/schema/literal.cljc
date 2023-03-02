(ns metabase.lib.schema.literal
  "Malli schemas for string, temporal, number, and boolean literals."
  (:require [metabase.util.malli.registry :as mr]))

(mr/def ::boolean
  [:boolean])

(mr/def ::integer
  [:int])

(mr/def ::floating-point
  [:double])

(mr/def ::string
  [:string])

(mr/def ::date
  ;; TODO
  ;; (count "2022-02-23") => 10
  [:string {:min 10}])

(mr/def ::time
  ;; TODO
  ;; (count "13:12") => 5
  [:string {:min 5}])

(mr/def ::datetime
  ;; TODO
  ;; (count "2022-02-23T13:12") => 16
  [:string {:min 16}])

(mr/def ::temporal
  [:or
   ::date
   ::time
   ::datetime])
