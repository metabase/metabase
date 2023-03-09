(ns metabase.lib.schema.literal
  "Malli schemas for string, temporal, number, and boolean literals."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(defmethod expression/type-of* :dispatch-type/nil
  [_nil]
  :type/*)

(mr/def ::boolean
  :boolean)

(defmethod expression/type-of* :dispatch-type/boolean
  [_bool]
  :type/Boolean)

(mr/def ::integer
  [:int])

(defmethod expression/type-of* :dispatch-type/integer
  [_int]
  :type/Integer)

(mr/def ::non-integer-real
  [:double])

(defmethod expression/type-of* :dispatch-type/number
  [_non-integer-real]
  ;; `:type/Float` is the 'base type' of all non-integer real number types in [[metabase.types]] =(
  :type/Float)

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

(defmethod expression/type-of* :dispatch-type/string
  [s]
  (condp mc/validate s
    ::datetime #{:type/Text :type/DateTime}
    ::date     #{:type/Text :type/Date}
    ::time     #{:type/Text :type/Time}
    :type/Text))
