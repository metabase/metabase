(ns metabase.lib.schema.expression
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.filter :as filter]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.ref :as ref]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

(defn- ref-of-base-type [base-type]
  [:and
   [:ref ::ref/ref]
   [:fn
    {:error/message (str ":field, :expression, :or :aggregation with a " base-type " :base-type")}
    (fn [[_ref opts]]
          (isa? (:base-type opts) base-type))]])

(defn- ref-of-base-type-with-temporal-unit [base-type temporal-unit-schema]
  [:and
   (ref-of-base-type base-type)
   [:fn
    {:error/message (str ":field, :expression, :or :aggregation reference returning a "
                         base-type
                         " with a :temporal-unit that matches "
                         ;; TODO -- humanize this
                         (pr-str temporal-unit-schema))}
    (let [validator (mc/validator temporal-unit-schema)]
      (fn [[_ref {:keys [temporal-unit], :as _opts}]]
        (validator temporal-unit)))]])

;;; An expression that we can filter on, or do case statements on, etc.
(mr/def ::boolean
  [:or
   {:error/message "expression returning a boolean"}
   [:ref ::literal/boolean]
   [:ref ::filter/filter]
   (ref-of-base-type :type/Boolean)])

;;; An expression that returns a string.
(mr/def ::string
  [:or
   {:error/message "expression returning a string"}
   [:ref ::literal/string]
   (ref-of-base-type :type/Text)])

;;; `:length` clause: returns an integer
;;;
;;; [:length options <string-expression>
(mr/def ::length
  [:tuple
   [:= :length]
   ::common/options
   ::string])

;;; a `:*` clause with all integer expression arguments returns an integer.
(mr/def ::*.integer
  [:schema
   [:cat
    [:= :*]
    ::common/options
    [:* [:schema [:ref ::integer]]]]])

;;; An expression that returns an integer.
(mr/def ::integer
  [:or
   {:error/message "expression returning an integer"}
   ::literal/integer
   ::length
   [:ref ::*.integer]
   (ref-of-base-type :type/Integer)
   ;; `:temporal-extract` units like `:day-of-month` actually return `:type/Integer` rather than a temporal type
   (ref-of-base-type-with-temporal-unit :type/Date     ::temporal-bucketing/unit.date.extract)
   (ref-of-base-type-with-temporal-unit :type/Time     ::temporal-bucketing/unit.time.extract)
   (ref-of-base-type-with-temporal-unit :type/DateTime ::temporal-bucketing/unit.date-time.extract)])

;;; a `:*` clause that isn't an `::*.integer` (i.e., one or more clauses sub-expressions is a non-integer-real expression)
;;; returns a non-integer-real number
(mr/def ::*.non-integer-real
  [:and
   [:schema
    [:cat
     [:= :*]
     ::common/options
     [:* [:schema [:ref ::number]]]]]
   [:not ::*.integer]])

;;; An expression that returns a number that includes a non-integer-real place, including but not limited floats, doubles,
;;; BigDecimals, SmallDecimals, MediumDecimals, etc! Basically any normal number that isn't an integer!
(mr/def ::non-integer-real
  [:or
   {:error/message "expression returning a number with a non-integer-real place"}
   [:ref ::literal/non-integer-real]
   [:ref ::*.non-integer-real]
   ;; for some crazy reason `:type/Float` is the common base type of all numbers with non-integer-real places, not something
   ;; smart like `:type/Decimal`
   (ref-of-base-type :type/Float)])

;;; Any expression that returns any kind of number.
(mr/def ::number
  [:or
   {:error/message "expression returning a number"}
   ::integer
   ::non-integer-real])

;;; `:datetime-add` with a Date expression:
;;;
;;;    [:datetime-add <options> <date-expression> <amount> <date-interval-unit>]
(mr/def ::datetime-add.date
  [:schema
   [:tuple
    [:= :datetime-add]
    ::common/options
    #_expression [:ref ::date]
    #_amount     [:ref ::integer]
    #_unit       ::temporal-bucketing/unit.date.interval]])

;;; Any expression that returns a `:type/Date`
(mr/def ::date
  [:or
   {:error/message "expression returning a date"}
   [:ref ::literal/date]
   [:ref ::datetime-add.date]
   (ref-of-base-type-with-temporal-unit :type/Date [:not ::temporal-bucketing/unit.date.extract])
   ;; TODO -- does a truncation of a :type/DateTime to `::temporal-bucketing/unit.date.truncate` like `:day` return a
   ;; `:type/Date`? Should we act like it does?
   #_(ref-of-base-type-with-temporal-unit :type/DateTime ::temporal-bucketing/unit.date.truncate)])

;;; `:datetime-add` with a Time expression:
;;;
;;;    [:datetime-add <options> <time-expression> <amount> <time-interval-unit>]
(mr/def ::datetime-add.time
  [:schema
   [:tuple
    [:= :datetime-add]
    ::common/options
    #_expression [:ref ::time]
    #_amount     [:ref ::integer]
    #_unit       ::temporal-bucketing/unit.time.interval]])

;;; Any expression that returns a `:type/Time`
(mr/def ::time
  [:or
   {:error/message "expression returning a time"}
   [:ref ::literal/time]
   [:ref ::datetime-add.time]
   (ref-of-base-type-with-temporal-unit :type/Time [:not ::temporal-bucketing/unit.time.extract])])

;;; `:datetime-add` with a DateTime expression:
;;;
;;;    [:datetime-add <options> <date-time-expression> <amount> <date-time-interval-unit>]
(mr/def ::datetime-add.date-time
  [:tuple
   {:error/message ":datetime-add clause with a date time expression"}
   [:= :datetime-add]
   ::common/options
   #_expression [:ref ::date-time]
   #_amount     [:ref ::integer]
   #_unit       ::temporal-bucketing/unit.date-time.interval])

;;; Any expression that returns a `:type/DateTime`
(mr/def ::date-time
  [:or
   {:error/message "expression returning a date time"}
   [:ref ::literal/date-time]
   [:ref ::datetime-add.date-time]
   (ref-of-base-type-with-temporal-unit :type/DateTime [:not ::temporal-bucketing/unit.date-time.extract])])

;;; Any expression that returns some sort of temporal value `java.time.OffsetDateTime`
(mr/def ::temporal
  [:or
   {:error/message "expression returning a date, time, or date time"}
   ::date
   ::time
   ::date-time])

;;; Any type of expression that you can appear in an `:order-by` clause, or in a filter like `:>` or `:<=`. This is
;;; basically everything except for boolean expressions.
(mr/def ::orderable
  [:or
   ::string
   ::number
   ::temporal
   ;; we'll also assume Fields all orderable. This isn't true of all fields but we're not smart enough yet to attach
   ;; expression types to Fields. Maybe if we were smarter we could do that. Should every `:field` include
   ;; `:base-type` info?
   [:ref ::ref/ref]])

;;; Any type of expression that can appear in an `:=` or `!=`. I guess this is currently everything?
(mr/def ::equality-comparable
  [:maybe
   [:or
    ::boolean
    ::string
    ::number
    ::temporal
    [:ref ::ref/ref]]])

;;; Any sort of expression at all.
(mr/def ::expression
  [:maybe
   [:or
    ::boolean
    ::string
    ::number
    ::temporal
    [:ref ::ref/ref]
    ;; this is here for now until we fill this schema out with all of the possibilities.
    any?]])

;;; the `:expressions` definition map as found as a top-level key in an MBQL stage
(mr/def ::expressions
  [:map-of
   {:min 1, :error/message ":expressions definition map of expression name -> expression"}
   ::common/non-blank-string
   ::expression])
