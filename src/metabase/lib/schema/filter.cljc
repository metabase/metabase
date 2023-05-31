(ns metabase.lib.schema.filter
  "Schemas for the various types of filter clauses that you'd pass to `:filters` or use inside something else that takes
  a boolean expression."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.lib.schema.temporal-bucketing :as temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(doseq [op [:and :or]]
  (mbql-clause/define-catn-mbql-clause op :- :type/Boolean
    [:args [:repeat {:min 2} [:schema [:ref ::expression/boolean]]]]))

(mbql-clause/define-tuple-mbql-clause :not :- :type/Boolean
  [:ref ::expression/boolean])

(doseq [op [:= :!=]]
  (mbql-clause/define-catn-mbql-clause op :- :type/Boolean
    [:args [:repeat {:min 2} [:schema [:ref ::expression/equality-comparable]]]]))

(doseq [op [:< :<= :> :>=]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Boolean
    #_x [:ref ::expression/orderable]
    #_y [:ref ::expression/orderable]))

(mbql-clause/define-tuple-mbql-clause :between :- :type/Boolean
  ;; TODO -- we should probably enforce additional constraints that the various arg types have to agree, e.g. it makes
  ;; no sense to say something like `[:between {} <date> <[:ref ::expression/string]> <integer>]`
  #_expr [:ref ::expression/orderable]
  #_min  [:ref ::expression/orderable]
  #_max  [:ref ::expression/orderable])

;; sugar: a pair of `:between` clauses
(mbql-clause/define-tuple-mbql-clause :inside :- :type/Boolean
  #_lat-expr [:ref ::expression/orderable]
  #_lon-expr [:ref ::expression/orderable]
  #_lat-max  [:ref ::expression/orderable]
  #_lon-min  [:ref ::expression/orderable]
  #_lat-min  [:ref ::expression/orderable]
  #_lon-max  [:ref ::expression/orderable])

;;; null checking expressions
;;;
;;; these are sugar for [:= ... nil] and [:!= ... nil] respectively
(doseq [op [:is-null :not-null]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Boolean
    [:ref ::expression/expression]))

;;; one-arg [:ref ::expression/string] filter clauses
;;;
;;; :is-empty is sugar for [:or [:= ... nil] [:= ... ""]]
;;;
;;; :not-empty is sugar for [:and [:!= ... nil] [:!= ... ""]]
(doseq [op [:is-empty :not-empty]]
  (mbql-clause/define-tuple-mbql-clause op :- :type/Boolean
    [:ref ::expression/string]))

(def ^:private string-filter-options
  [:map [:case-sensitive {:optional true} :boolean]]) ; default true

;; binary [:ref ::expression/string] filter clauses. These also accept a `:case-sensitive` option
;;
;; `:does-not-contain` is sugar for `[:not [:contains ...]]`:
;;
;; [:does-not-contain ...] = [:not [:contains ...]]
(doseq [op [:starts-with :ends-with :contains :does-not-contain]]
  (mbql-clause/define-mbql-clause op :- :type/Boolean
    [:tuple
     [:= op]
     [:merge ::common/options string-filter-options]
     #_whole [:ref ::expression/string]
     #_part  [:ref ::expression/string]]))

(def ^:private time-interval-options
  [:map [:include-current {:optional true} :boolean]]) ; default false

;; SUGAR: rewritten as a filter clause with a relative-datetime value
(mbql-clause/define-mbql-clause :time-interval :- :type/Boolean
  ;; TODO -- we should probably further constrain this so you can't do weird stuff like
  ;;
  ;;    [:time-interval {} <time> :current :year]
  ;;
  ;; using units that don't agree with the expr type
  [:tuple
   [:= :time-interval]
   [:merge ::common/options time-interval-options]
   #_expr [:ref ::expression/temporal]
   #_n    [:or
           [:enum :current :last :next]
           ;; I guess there's no reason you shouldn't be able to do something like 1 + 2 in here
           [:ref ::expression/integer]]
   #_unit [:ref ::temporal-bucketing/unit.date-time.interval]])

;; segments are guaranteed to return valid filter clauses and thus booleans, right?
(mbql-clause/define-mbql-clause :segment :- :type/Boolean
  [:tuple
   [:= :segment]
   ::common/options
   [:or ::common/int-greater-than-zero ::common/non-blank-string]])

(mr/def ::operator
  [:map
   [:lib/type [:= :mbql.filter/operator]]
   [:short [:enum := :!= :inside :between :< :> :<= :>= :is-null :not-null :is-empty :not-empty :contains :does-not-contain :starts-with :ends-with]]
   [:display-name :string]])
