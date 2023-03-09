(ns metabase.lib.schema.filter
  "Schemas for the various types of filter clauses that you'd pass to `:filter` or use inside something else that takes
  a boolean expression."
  (:require
   [clojure.set :as set]
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.mbql-clause :as mbql-clause]
   [metabase.types :as types]
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
  #_lat-field [:ref ::expression/orderable]
  #_lon-field [:ref ::expression/orderable]
  #_lat-max   [:ref ::expression/orderable]
  #_lon-min   [:ref ::expression/orderable]
  #_lat-min   [:ref ::expression/orderable]
  #_lon-max   [:ref ::expression/orderable])

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
     #_part [:ref ::expression/string]]))

(def ^:private time-interval-options
  [:map [:include-current {:optional true} :boolean]]) ; default false

(def ^:private relative-datetime-unit
  [:enum :default :minute :hour :day :week :month :quarter :year])

;; SUGAR: rewritten as a filter clause with a relative-datetime value
(mbql-clause/define-mbql-clause :time-interval :- :type/Boolean
  ;; TODO -- we should probably further constraint this so you can't do weird stuff like
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
   #_unit relative-datetime-unit])

;; segments are guaranteed to return valid filter clauses and thus booleans, right?
(mbql-clause/define-mbql-clause :segment :- :type/Boolean
  [:tuple
   [:= :segment]
   ::common/options
   [:or ::common/int-greater-than-zero ::common/non-blank-string]])

;;; believe it or not, a `:case` clause really has the syntax [:case {} [[pred1 expr1] [pred2 expr2] ...]]
(mr/def ::case-subclause
  [:tuple
   {:error/message "Valid :case [pred expr] pair"}
   #_pred [:ref ::expression/boolean]
   #_expr [:ref ::expression/expression]])

;;; TODO -- this is not really a filter clause and doesn't belong in here. But where does it belong?
(mbql-clause/define-tuple-mbql-clause :case
  ;; TODO -- we should further constrain this so all of the exprs are of the same type
  [:sequential {:min 1} [:ref ::case-subclause]])

;;; the logic for calculating the return type of a `:case` statement is not optimal nor perfect. But it should be ok
;;; for now and errors on the side of being permissive. See this Slack thread for more info:
;;; https://metaboat.slack.com/archives/C04DN5VRQM6/p1678325996901389
(defmethod expression/type-of* :case
  [[_tag _opts pred-expr-pairs]]
  (reduce
   (fn [best-guess [_pred expr]]
     (let [return-type (expression/type-of expr)]
       (cond
         (nil? best-guess)
         return-type

         ;; if both types are keywords return their most-specific ancestor.
         (and (keyword? best-guess)
              (keyword? return-type))
         (types/most-specific-common-ancestor best-guess return-type)

         ;; if one type is a specific type but the other is an ambiguous union of possible types, return the specific
         ;; type. A case can't possibly have multiple different return types, so if one expression has an unambiguous
         ;; type then the whole thing has to have a compatible type.
         (keyword? best-guess)
         best-guess

         (keyword? return-type)
         return-type

         ;; if both types are ambiguous unions of possible types then return the intersection of the two. But if the
         ;; intersection is empty, return the union of everything instead. I don't really want to go down a rabbit
         ;; hole of trying to find the intersection between the most-specific common ancestors
         :else
         (or (when-let [intersection (not-empty (set/intersection best-guess return-type))]
               (if (= (count intersection) 1)
                 (first intersection)
                 intersection))
             (set/union best-guess return-type)))))
   nil
   pred-expr-pairs))
