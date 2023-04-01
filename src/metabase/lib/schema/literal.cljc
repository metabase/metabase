(ns metabase.lib.schema.literal
  "Malli schemas for string, temporal, number, and boolean literals."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]
   #?@(:clj ([metabase.lib.schema.literal.jvm]))
   [medley.core :as m]))

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
  [:re
   {:error/message "date string literal"}
   local-date-regex])

(mr/def ::string.time
  [:or
   [:re
    {:error/message "local time string literal"}
    local-time-regex]
   [:re
    {:error/message "offset time string literal"}
    offset-time-regex]])

(mr/def ::string.datetime
  [:or
   [:re
    {:error/message "local date time string literal"}
    local-datetime-regex]
   [:re
    {:error/message "offset date time string literal"}
    offset-datetime-regex]])

(defmethod expression/type-of* :dispatch-type/string
  [s]
  (condp mc/validate s
    ::string.datetime #{:type/Text :type/DateTime}
    ::string.date     #{:type/Text :type/Date}
    ::string.time     #{:type/Text :type/Time}
    :type/Text))

(mr/def ::date.raw
  #?(:clj  [:or
            :time/local-date
            ::string.date]
     :cljs ::string.date))

(mr/def ::time.raw
  #?(:clj [:or
           ::string.time
           :time/local-time
           :time/offset-time]
     :cljs ::string.time))

(mr/def ::datetime.raw
  #?(:clj [:or
           ::string.datetime
           :time/local-date-time
           :time/offset-date-time
           :time/zoned-date-time]
     :cljs ::string.datetime))

(mr/def ::temporal.raw
  [:or
   [:ref ::date.raw]
   [:ref ::time.raw]
   [:ref ::datetime.raw]])

(mr/def ::absolute-datetime.base-type
  [:and
   [:ref ::common/base-type]
   [:fn
    {:error/message ":absolute-datetime base-type must derive from :type/Date or :type/DateTime"}
    (fn [base-type]
      (some #(isa? base-type %)
            [:type/Date
             :type/DateTime]))]])

(mbql-clause/define-mbql-clause :absolute-datetime
  [:cat
   {:error/message "valid :absolute-datetime clause"}
   [:= :absolute-datetime]
   [:schema [:ref ::common/options]]
   [:alt
    [:cat
     {:error/message ":absolute-datetime literal and unit for :type/Date"}
     [:schema [:ref ::date.raw]]
     [:schema [:or
               [:= :default]
               [:ref ::lib.schema.temporal-bucketing/unit.date]]]]
    [:cat
     {:error/message ":absolute-datetime literal and unit for :type/DateTime"}
     [:schema [:ref ::datetime.raw]]
     [:schema [:or
               [:= :default]
               [:ref ::lib.schema.temporal-bucketing/unit.date-time]]]]]])

(defmethod expression/type-of* :absolute-datetime
  [[_tag _opts value _unit]]
  ;; for things that return a union of types like string literals, only the temporal types make sense, so filter out
  ;; everything else.
  (let [value-type (expression/type-of value)
        value-type (if (set? value-type)
                     (into #{} (filter #(isa? % :type/Temporal)) value-type)
                     value-type)]
    (if (and (set? value-type)
             (= (count value-type) 1))
      (first value-type)
      value-type)))

(mbql-clause/define-tuple-mbql-clause :time :- :type/Time
  [:ref ::time.raw]
  [:ref ::lib.schema.temporal-bucketing/unit.time])

(defn- absolute-datetime-of-type [base-type]
  [:and
   [:ref :mbql.clause/absolute-datetime]
   [:fn
    {:error/message (str ":absolute-datetime of type " base-type)}
    (fn [[_tag opts _value _unit]]
      (isa? (:base-type opts) base-type))]])

(mr/def ::date
  [:or
   [:ref ::date.raw]
   (absolute-datetime-of-type :type/Date)])

(mr/def ::time
  [:or
   [:ref ::time.raw]
   [:ref :mbql.clause/time]])

(mr/def ::datetime
  [:or
   [:ref ::datetime.raw]
   (absolute-datetime-of-type :type/DateTime)])

(mr/def ::temporal
  [:or
   [:ref ::date]
   [:ref ::time]
   [:ref ::datetime]])
