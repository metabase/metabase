(ns metabase.lib.schema.literal
  "Malli schemas for string, temporal, number, and boolean literals."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]
   #?@(:clj ([metabase.lib.schema.literal.jvm]))))

(defmethod expression/type-of* :dispatch-type/nil
  [_nil]
  :type/*)

(mr/def ::boolean
  :boolean)

(defmethod expression/type-of* :dispatch-type/boolean
  [_bool]
  :type/Boolean)

(mr/def ::boolean
  :boolean)

(mr/def ::integer
  #?(:clj [:or
           :int
           :metabase.lib.schema.literal.jvm/big-integer]
     :cljs :int))

(defmethod expression/type-of* :dispatch-type/integer
  [_int]
  :type/Integer)

;;; we should probably also restrict this to disallow NaN and positive/negative infinity, I don't know in what
;;; universe we'd want to allow those if they're not disallowed already.
(mr/def ::non-integer-real
  #?(:clj [:or
           :double
           :metabase.lib.schema.literal.jvm/float
           :metabase.lib.schema.literal.jvm/big-decimal]
     :cljs :double))

(defmethod expression/type-of* :dispatch-type/number
  [_non-integer-real]
  ;; `:type/Float` is the 'base type' of all non-integer real number types in [[metabase.types]] =(
  :type/Float)

(mr/def ::string
  :string)

;;; TODO -- these temporal literals could be a little stricter, right now they are pretty permissive, you shouldn't be
;;; allowed to have month `13` or `02-29` for example

;;; TODO -- these were split out into separate parts originally but apparently string <-> re-pattern conversion
;;; doesn't work in Cljs the way it works in Clj

(def ^:private local-date-regex
  #"^\d{4}-\d{2}-\d{2}$")

(def ^:private local-time-regex
  #"^\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?$")

(def ^:private offset-time-regex
  #"^\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?)$")

(def ^:private local-datetime-regex
  #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?$")

(def ^:private offset-datetime-regex
  #"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?)$")


(mr/def ::string.date
  [:re local-date-regex])

(mr/def ::string.time
  [:or
   [:re local-time-regex]
   [:re offset-time-regex]])

(mr/def ::string.datetime
  [:or
   [:re local-datetime-regex]
   [:re offset-datetime-regex]])

(defmethod expression/type-of* :dispatch-type/string
  [s]
  (condp mc/validate s
    ::string.datetime #{:type/Text :type/DateTime}
    ::string.date     #{:type/Text :type/Date}
    ::string.time     #{:type/Text :type/Time}
    :type/Text))

(mr/def ::date
  #?(:clj  [:or
            :time/local-date
            ::string.date]
     :cljs ::string.date))

(mr/def ::time
  #?(:clj [:or
           ::string.time
           :time/local-time
           :time/offset-time]
     :cljs ::string.time))

(mr/def ::datetime
  #?(:clj [:or
           ::string.datetime
           :time/local-date-time
           :time/offset-date-time
           :time/zoned-date-time]
     :cljs ::string.datetime))

(mr/def ::temporal
  [:or
   ::date
   ::time
   ::datetime])
