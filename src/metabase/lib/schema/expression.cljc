(ns metabase.lib.schema.expression
  (:require
   [metabase.lib.schema.filter :as filter]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.ref :as ref]
   [metabase.util.malli.registry :as mr]))

;;; An expression that we can filter on, or do case statements on, etc.
(mr/def ::boolean
  [:or
   ::literal/boolean
   [:ref ::filter/filter]])

;;; An expression that returns a string.
(mr/def ::string
  ::literal/string)

;;; An expression that returns an integer.
(mr/def ::integer
  ::literal/integer)

;;; An expression that returns a floating-point number.
(mr/def ::floating-point
  ::literal/floating-point)

;;; Any expression that returns any kind of number.
(mr/def ::number
  [:or
   ::integer
   ::floating-point])

;;; Any expression that returns some sort of temporal value `java.time.OffsetDateTime`
(mr/def ::temporal
  ;; TODO
  [:or
   ::literal/temporal])

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
   ::ref/ref])

;;; Any type of expression that can appear in an `:=` or `!=`. I guess this is currently everything?
(mr/def ::equality-comparable
  [:maybe
   [:or
    ::boolean
    ::string
    ::number
    ::temporal
    ::ref/ref]])
