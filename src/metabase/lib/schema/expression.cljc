(ns metabase.lib.schema.expression
  (:require
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

(doseq [op [::year ::month ::day ::hour ::minute ::second ::quarter]]
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

(defclause ::week
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

(defclause ::coalesce
  [:+ [:catn [:expr [:schema [:ref ::expression]]]]])

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
   ::year ::month ::day ::hour ::minute ::second ::quarter ::week
   ::datetime-diff

   ::literal/integer
   ;; TODO base-type fields
   [:schema [:ref ::ref/field]]])

;;; An expression that returns a floating-point number.
(mr/def ::floating-point
  [:or
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
   ::expression])

(mr/def ::expression
  [:or
   [:schema [:ref ::number]]
   [:schema [:ref ::string]]
   [:schema [:ref ::boolean]]
   [:schema [:ref ::temporal]]
   ;; These can return any type, so while they may be ::orderable, that's not guaranteed
   ::case
   ::coalesce])

(comment
  (require '[malli.core :as mc]
           '[malli.generator :as mg])

  (let [schema ::case
        sample (mg/sample schema {:size 10})]
    sample
    (not-empty (remove #(mc/validate schema %) sample)))

  nil)
