(ns metabase.lib.schema.expression
  (:require
   [clojure.walk :as walk]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.filter :as filter]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.ref :as ref]
   [metabase.util.malli.registry :as mr]))

(defn- defclause
  [sch & args]
  {:pre [(qualified-keyword? sch)]}
  (mr/def sch
    [:vcatn
     [:clause [:= (keyword (name sch))]]
     [:options ::common/options]
     (into [:args] args)]))

(doseq [op [::abs ::ceil ::floor ::log ::round ::exp ::sqrt]]
  (defclause op
    [:vcatn [:num [:schema [:ref ::number]]]]))

(defclause ::power
  [:vcatn
   [:num [:schema [:ref ::number]]]
   [:exp [:schema [:ref ::number]]]])

(doseq [op [::trim ::ltrim ::rtrim ::upper ::lower ::length]]
  (defclause op
    [:vcatn [:str [:schema [:ref ::string]]]]))

(doseq [op [::get-year ::get-month ::get-day ::get-hour ::get-minute ::get-second ::get-quarter]]
  (defclause op
    [:vcatn [:datetime [:schema [:ref ::temporal]]]]))

(doseq [op [::datetime-add ::datetime-subtract]]
  (defclause op
    [:vcatn
     [:datetime [:schema [:ref ::temporal]]]
     [:amount [:schema [:ref ::integer]]]
     [:unit [:enum "year" "month" "day" "hour" "second" "millisecond" "quarter"]]]))

(defclause ::datetime-diff
  [:vcatn
   [:datetime1 [:schema [:ref ::temporal]]]
   [:datetime2 [:schema [:ref ::temporal]]]
   [:unit [:enum "year" "month" "day" "hour" "second" "millisecond" "quarter"]]])

(defclause ::get-week
  [:vcatn
   [:datetime [:schema [:ref ::temporal]]]
   [:mode [:maybe [:enum "ISO" "US" "Instance"]]]])

(defclause ::regexextract
  [:vcatn
   [:str [:schema [:ref ::string]]]
   ;; TODO regex type?
   [:regex [:schema [:ref ::string]]]])

(defclause ::replace
  [:vcatn
   [:str [:schema [:ref ::string]]]
   [:find [:schema [:ref ::string]]]
   [:replace [:schema [:ref ::string]]]])

(defclause ::substring
  [:vcatn
   [:str [:schema [:ref ::string]]]
   [:start [:schema [:ref ::integer]]]
   [:end [:schema [:ref ::integer]]]])

(defclause ::case
  [:+ [:catn
       [:pred [:schema [:ref ::boolean]]]
       [:expr [:schema [:ref ::expression]]]]])

(defn- deftypedclause [op args]
  (let [nspace (namespace op)
        base-op (name op)]
    (doseq [typ ["boolean" "integer" "floating-point" "string" "temporal"]
            :let [typed-op (keyword nspace (str base-op "." typ))
                  return-type (keyword nspace typ)
                  typed-args (walk/postwalk (fn [n] (if (= n ::_RETURN_TYPE)
                                                      return-type
                                                      n))
                                            args)]]
      (mr/def typed-op
        [:vcatn
         [:clause [:= (keyword base-op)]]
         [:options ::common/options]
         (into [:args] typed-args)]))))

(deftypedclause ::case
  [:args [:+ [:catn
              [:pred [:schema [:ref ::boolean]]]
              [:expr [:schema [:ref ::_RETURN_TYPE]]]]]])

(deftypedclause ::coalesce
  [:+ [:catn [:expr [:schema [:ref ::_RETURN_TYPE]]]]])

(defclause ::concat
  [:+ [:catn [:str [:schema [:ref ::string]]]]])

(defclause ::convert-timezone
  [:vcatn
   [:datetime [:schema [:ref ::temporal]]]
   ;; TODO could be better specified - perhaps with a build time macro to inline the timezones?
   ;; NOT expressions?
   [:target [:string]]
   [:source [:maybe [:string]]]])

;;; An expression that we can filter on, or do case statements on, etc.
(mr/def ::boolean
  [:or
   ::case.boolean
   ::coalesce.boolean
   ::literal/boolean
   [:schema [:ref ::filter/filter]]
   ;; TODO base-type fields
   [:schema [:ref ::ref/field]]])

;;; An expression that returns a string.
(mr/def ::string
  [:or
   ::trim
   ::ltrim
   ::rtrim
   ::upper
   ::lower
   ::regexextract
   ::replace
   ::substring
   ::concat
   ::case.string
   ::coalesce.string
   ::literal/string
   ;; TODO base-type fields
   [:schema [:ref ::ref/field]]])

;;; An expression that returns an integer.
(mr/def ::integer
  [:or
   ;; number -> int
   ::ceil
   ::floor
   ::round
   ;; string -> int
   ::length
   ;; temporal -> int
   ::get-year ::get-month ::get-day ::get-hour ::get-minute ::get-second ::get-quarter ::get-week
   ::datetime-diff

   ;; TODO should be number?
   ::case.integer
   ::coalesce.integer
   ::literal/integer
   ;; TODO base-type fields
   [:schema [:ref ::ref/field]]])

;;; An expression that returns a floating-point number.
(mr/def ::floating-point
  [:or
   ;; TODO should be number?
   ::case.floating-point
   ::coalesce.floating-point
   ::literal/floating-point
   ;; TODO base-type fields
   [:schema [:ref ::ref/field]]])

;;; Any expression that returns any kind of number.
(mr/def ::number
  [:or
   ::abs
   ::log
   ::sqrt
   ::exp
   ::power
   ::integer
   ::floating-point])

;;; Any expression that returns some sort of temporal value `java.time.OffsetDateTime`
(mr/def ::temporal
  [:or
   ::datetime-add
   ::datetime-subtract
   ::convert-timezone

   ::case.temporal
   ::coalesce.floating-point
   ::literal/temporal
   ;; TODO base-type fields
   [:schema [:ref ::ref/field]]])

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

