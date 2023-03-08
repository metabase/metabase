(ns metabase.lib.schema.filter
  "Schemas for the various types of filter clauses that you'd pass to `:filter` or use inside something else that takes
  a boolean expression."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.ref :as ref]
   [metabase.util.malli.registry :as mr]))

(def ^:private eq-comparable
  ;; avoid circular refs between these namespaces.
  [:schema [:ref :metabase.lib.schema.expression/equality-comparable]])

(def ^:private orderable
  ;; avoid circular refs between these namespaces.
  [:schema [:ref :metabase.lib.schema.expression/orderable]])

(defn- defclause
  [sch & args]
  {:pre [(qualified-keyword? sch)]}
  (mr/def sch
    [:catn
     [:clause [:= (keyword (name sch))]]
     [:options ::common/options]
     (into [:args] args)]))

(doseq [op [::and ::or]]
  (defclause op [:repeat {:min 2} [:schema [:ref ::filter]]]))

(defclause ::not
  [:schema [:ref ::filter]])

(doseq [op [::= ::!=]]
  (defclause op
    [:repeat {:min 2} eq-comparable]))

(doseq [op [::< ::<= ::> ::>=]]
  (defclause op
    [:cat orderable orderable]))

(defclause ::between
  [:catn [:field orderable] [:min orderable] [:max orderable]])

;; sugar: a pair of `:between` clauses
(defclause ::inside
  [:catn
   [:lat-field orderable]
   [:lon-field orderable]
   [:lat-max   orderable]
   [:lon-min   orderable]
   [:lat-min   orderable]
   [:lon-max   orderable]])

;; [:= ... nil], [:!= ... nil], [:or [:= ... nil] [:= ... ""]], [:and [:!= ... nil] [:!= ... ""]]
(doseq [op [::is-null ::not-null ::is-empty ::not-empty]]
  (defclause op
    ::ref/field))

(def ^:private string-filter-options
  [:map [:case-sensitive {:optional true} :boolean]]) ; default true

(def ^:private string
  [:schema [:ref :metabase.lib.schema.expression/string]])

;; [:does-not-contain ...] = [:not [:contains ...]]
(doseq [op [::starts-with ::ends-with ::contains ::does-not-contain]]
  (mr/def op
    [:catn
     [:clause [:= (keyword (name op))]]
     [:options [:merge ::common/options string-filter-options]]
     [:args [:catn [:whole string] [:part string]]]]))

(def ^:private time-interval-options
  [:map [:include-current {:optional true} :boolean]]) ; default false

(def ^:private relative-datetime-unit
  [:enum :default :minute :hour :day :week :month :quarter :year])

;; SUGAR: rewritten as a filter clause with a relative-datetime value
(mr/def ::time-interval
  [:catn
   [:clause [:= :time-interval]]
   [:options [:merge ::common/options time-interval-options]]
   [:args [:catn
           [:field ::ref/field]
           [:n [:or :int [:enum :current :last :next]]]
           [:unit relative-datetime-unit]]]])

(defclause ::segment
  [:catn [:segment-id [:or ::common/int-greater-than-zero ::common/non-blank-string]]])

(defclause ::case
  [:+ [:catn
       [:pred [:schema [:ref ::filter]]]
       [:expr [:schema [:ref :metabase.lib.schema.expression/boolean]]]]])

;; Boolean literals are not included here because they are not very portable
;; across different databases. In places where they should also be allowed
;; the :metabase.lib.schema.expression/boolean schema can be used.
(mr/def ::filter
  [:or
   [:ref ::ref/field]
   ;; primitive clauses
   ::and
   ::or
   ::not
   ::= ::!=
   ::< ::<=
   ::> ::>=
   ::between
   ::starts-with ::ends-with ::contains
   ::case
   ;; sugar clauses
   ::inside
   ::is-null ::not-null
   ::is-empty ::not-empty
   ::does-not-contain
   ::time-interval
   ::segment])
